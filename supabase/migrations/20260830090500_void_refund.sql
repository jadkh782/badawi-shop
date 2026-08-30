-- ---------------------------------------------------------------------------
-- Taking a sale back, two different ways.
--
-- A void says the sale should never have happened: the wrong article was scanned, or the
-- customer changed their mind before leaving. It is a mistake being erased, so it is erased
-- everywhere, including from the day it was rung up on. Last Tuesday's report stops counting
-- it because last Tuesday it did not really happen.
--
-- A refund says the sale did happen and some of it is coming back now. That is a real event
-- with its own date, so it counts against today rather than reaching back into a month that
-- has already been read and acted on. It can be partial: three of the six tins are returned
-- and the other three stay sold.
--
-- Both put units back on the batch they came from, so stock handed back at last month's
-- price is still stock at last month's price, and both move the money in the same
-- transaction as the stock, so the shelf and the cash box can never disagree.
-- ---------------------------------------------------------------------------

alter table public.sales add column if not exists voided_at   timestamptz;
alter table public.sales add column if not exists voided_by   uuid references auth.users (id) on delete set null;
alter table public.sales add column if not exists void_reason text;

-- Every report walks live sales in date order, and after this most of them carry the filter.
create index if not exists sales_live_idx
  on public.sales (sold_at desc) where voided_at is null;

-- ---------------------------------------------------------------------------
-- sale_refunds: one counter transaction, with the lines that came back.
-- ---------------------------------------------------------------------------
create table if not exists public.sale_refunds (
  id           uuid          primary key default gen_random_uuid(),
  sale_id      uuid          not null references public.sales (id) on delete cascade,
  refunded_at  timestamptz   not null default now(),
  total_cents  bigint        not null default 0,
  cost_cents   bigint        not null default 0,
  profit_cents bigint        not null default 0,
  item_count   numeric(12,3) not null default 0,
  reason       text,
  created_by   uuid          references auth.users (id) on delete set null,
  created_at   timestamptz   not null default now()
);

create index if not exists sale_refunds_sale_idx on public.sale_refunds (sale_id);
create index if not exists sale_refunds_at_idx   on public.sale_refunds (refunded_at desc);

create table if not exists public.sale_refund_items (
  id               uuid          primary key default gen_random_uuid(),
  refund_id        uuid          not null references public.sale_refunds (id) on delete cascade,
  sale_item_id     uuid          not null references public.sale_items (id) on delete cascade,
  product_id       uuid          references public.products (id) on delete set null,
  product_name     text          not null,
  barcode          text,
  category_name    text,
  unit             text          not null default 'piece',
  quantity         numeric(12,3) not null check (quantity > 0),
  unit_price_cents integer       not null,
  unit_cost_cents  integer       not null,
  gross_cents      bigint        not null,
  -- What the customer actually gets back: the line less its share of the basket discount,
  -- the same proportional split the reports use, so a refund can never hand back more than
  -- was taken.
  net_cents        bigint        not null,
  cost_cents       bigint        not null,
  created_at       timestamptz   not null default now()
);

create index if not exists sale_refund_items_refund_idx on public.sale_refund_items (refund_id);
create index if not exists sale_refund_items_item_idx   on public.sale_refund_items (sale_item_id);

-- ---------------------------------------------------------------------------
-- How many of a sold line have already gone back.
-- ---------------------------------------------------------------------------
create or replace function public.refunded_quantity(p_sale_item_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(ri.quantity), 0)::numeric
  from public.sale_refund_items ri
  where ri.sale_item_id = p_sale_item_id;
$$;

-- ---------------------------------------------------------------------------
-- take_back: the units of one sold line, returned to the batches they left.
--
-- Walks that line's allocation in the order it was consumed, stepping over whatever has
-- already been handed back, and takes the next p_quantity from there. That is what makes a
-- second partial refund come off the right batch instead of the first one again.
--
-- Sales taken before batches existed have no allocation. They are still refundable: the
-- units go back on the shelf and are costed at the price recorded on the line itself, which
-- is exactly what that sale was costed at in the first place.
-- ---------------------------------------------------------------------------
create or replace function public.take_back(
  p_sale_item_id uuid,
  p_quantity     numeric,
  p_already      numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alloc  record;
  v_skip   numeric := coalesce(p_already, 0);
  v_want   numeric := p_quantity;
  v_free   numeric;
  v_take   numeric;
  v_cost   numeric := 0;
  v_return jsonb := '[]'::jsonb;
  v_unit   integer;
begin
  for v_alloc in
    select * from public.sale_item_batches
     where sale_item_id = p_sale_item_id
     order by created_at, id
  loop
    exit when v_want <= 0;

    v_free := v_alloc.quantity;

    if v_skip > 0 then
      v_free := v_free - least(v_skip, v_alloc.quantity);
      v_skip := v_skip - least(v_skip, v_alloc.quantity);
    end if;

    if v_free <= 0 then
      continue;
    end if;

    v_take := least(v_free, v_want);
    v_cost := v_cost + v_take * v_alloc.unit_cost_cents;
    v_want := v_want - v_take;

    if v_alloc.batch_id is not null then
      v_return := v_return || jsonb_build_object(
        'batch_id', v_alloc.batch_id,
        'quantity', v_take
      );
    end if;
  end loop;

  -- Nothing left to draw on: an older sale, or a batch that has since been collapsed away.
  if v_want > 0 then
    select unit_cost_cents into v_unit from public.sale_items where id = p_sale_item_id;
    v_cost := v_cost + v_want * coalesce(v_unit, 0);
  end if;

  perform public.return_to_batches(v_return);

  return jsonb_build_object('cost_cents', round(v_cost), 'returned', v_return);
end;
$$;

-- ---------------------------------------------------------------------------
-- void_sale: the whole thing, undone.
-- ---------------------------------------------------------------------------
create or replace function public.void_sale(p_sale_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale  public.sales%rowtype;
  v_item  record;
  v_back  jsonb;
  v_lines integer := 0;
  v_units numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to void a sale' using errcode = '42501';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;

  if not found then
    raise exception 'That sale no longer exists' using errcode = '23503';
  end if;

  if v_sale.voided_at is not null then
    raise exception 'That sale was already voided' using errcode = 'BS003';
  end if;

  -- A sale that has been partly handed back is a history, not a mistake. Erasing it would
  -- take the refund with it and leave the cash box holding a payment that never reversed.
  if exists (select 1 from public.sale_refunds where sale_id = p_sale_id) then
    raise exception 'That sale has already been refunded in part, so it cannot be voided'
      using errcode = 'BS003';
  end if;

  for v_item in
    select * from public.sale_items where sale_id = p_sale_id order by id
  loop
    v_back := public.take_back(v_item.id, v_item.quantity, 0);

    if v_item.product_id is not null then
      update public.products
         set quantity_in_stock = quantity_in_stock + v_item.quantity
       where id = v_item.product_id;

      perform public.sync_cost_from_batches(v_item.product_id);

      insert into public.stock_movements (product_id, delta, reason, sale_id, note, created_by)
      values (v_item.product_id, v_item.quantity, 'void', p_sale_id,
              nullif(btrim(coalesce(p_reason, '')), ''), auth.uid());
    end if;

    v_lines := v_lines + 1;
    v_units := v_units + v_item.quantity;
  end loop;

  if v_sale.total_cents > 0 then
    insert into public.cash_movements (kind, amount_cents, sale_id, note, created_by)
    values ('void', -v_sale.total_cents, p_sale_id,
            nullif(btrim(coalesce(p_reason, '')), ''), auth.uid());
  end if;

  update public.sales
     set voided_at   = now(),
         voided_by   = auth.uid(),
         void_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_sale_id;

  return jsonb_build_object(
    'sale_id',      p_sale_id,
    'lines',        v_lines,
    'units',        v_units,
    'total_cents',  v_sale.total_cents
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- refund_sale: some of it, back over the counter, today.
--
-- p_items is [{ "sale_item_id": uuid, "quantity": number }]. A line can be returned more
-- than once as long as the total never exceeds what was sold, which is checked against the
-- refunds already recorded rather than trusted from the caller.
-- ---------------------------------------------------------------------------
create or replace function public.refund_sale(
  p_sale_id uuid,
  p_items   jsonb,
  p_reason  text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale      public.sales%rowtype;
  v_refund_id uuid := gen_random_uuid();
  v_line      record;
  v_item      public.sale_items%rowtype;
  v_already   numeric;
  v_back      jsonb;
  v_gross     bigint;
  v_net       bigint;
  v_cost      bigint;
  v_line_net  bigint;
  v_sum_net   bigint := 0;
  v_sum_cost  bigint := 0;
  v_sum_units numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to refund a sale' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Choose what is being returned' using errcode = '22023';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;

  if not found then
    raise exception 'That sale no longer exists' using errcode = '23503';
  end if;

  if v_sale.voided_at is not null then
    raise exception 'That sale was voided, so there is nothing to refund' using errcode = 'BS003';
  end if;

  insert into public.sale_refunds (id, sale_id, reason, created_by)
  values (v_refund_id, p_sale_id, nullif(btrim(coalesce(p_reason, '')), ''), auth.uid());

  for v_line in
    select (elem ->> 'sale_item_id')::uuid as sale_item_id,
           sum((elem ->> 'quantity')::numeric) as quantity
    from jsonb_array_elements(p_items) as elem
    group by 1
    order by 1
  loop
    if v_line.quantity is null or v_line.quantity <= 0 then
      raise exception 'A returned quantity must be greater than zero' using errcode = '22023';
    end if;

    select * into v_item
      from public.sale_items
     where id = v_line.sale_item_id and sale_id = p_sale_id
     for update;

    if not found then
      raise exception 'That line is not part of this sale' using errcode = '23503';
    end if;

    v_already := public.refunded_quantity(v_item.id);

    if v_already + v_line.quantity > v_item.quantity then
      raise exception 'Only % of "%" can still be returned, % asked for',
        v_item.quantity - v_already, v_item.product_name, v_line.quantity
        using errcode = 'BS004';
    end if;

    -- The line's share of the basket discount, spread the same way the reports spread it, so
    -- a fully returned sale hands back exactly what was taken and not a cent more.
    v_line_net := v_item.line_total_cents - case
      when v_sale.subtotal_cents > 0
        then round(v_sale.discount_cents::numeric * v_item.line_total_cents / v_sale.subtotal_cents)
      else 0
    end;

    v_gross := round(v_item.unit_price_cents::numeric * v_line.quantity);
    v_net   := round(v_line_net::numeric * v_line.quantity / v_item.quantity);

    v_back := public.take_back(v_item.id, v_line.quantity, v_already);
    v_cost := (v_back ->> 'cost_cents')::bigint;

    if v_item.product_id is not null then
      update public.products
         set quantity_in_stock = quantity_in_stock + v_line.quantity
       where id = v_item.product_id;

      perform public.sync_cost_from_batches(v_item.product_id);

      insert into public.stock_movements (product_id, delta, reason, sale_id, note, created_by)
      values (v_item.product_id, v_line.quantity, 'refund', p_sale_id,
              nullif(btrim(coalesce(p_reason, '')), ''), auth.uid());
    end if;

    insert into public.sale_refund_items (
      refund_id, sale_item_id, product_id, product_name, barcode, category_name, unit,
      quantity, unit_price_cents, unit_cost_cents, gross_cents, net_cents, cost_cents
    ) values (
      v_refund_id, v_item.id, v_item.product_id, v_item.product_name, v_item.barcode,
      v_item.category_name, v_item.unit, v_line.quantity, v_item.unit_price_cents,
      case when v_line.quantity > 0 then round(v_cost / v_line.quantity) else 0 end,
      v_gross, v_net, v_cost
    );

    v_sum_net   := v_sum_net + v_net;
    v_sum_cost  := v_sum_cost + v_cost;
    v_sum_units := v_sum_units + v_line.quantity;
  end loop;

  update public.sale_refunds
     set total_cents  = v_sum_net,
         cost_cents   = v_sum_cost,
         profit_cents = v_sum_net - v_sum_cost,
         item_count   = v_sum_units
   where id = v_refund_id;

  if v_sum_net > 0 then
    insert into public.cash_movements (kind, amount_cents, sale_id, note, created_by)
    values ('refund', -v_sum_net, p_sale_id,
            nullif(btrim(coalesce(p_reason, '')), ''), auth.uid());
  end if;

  return jsonb_build_object(
    'refund_id',   v_refund_id,
    'total_cents', v_sum_net,
    'units',       v_sum_units
  );
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.refunded_quantity(uuid)',
    'public.take_back(uuid, numeric, numeric)',
    'public.void_sale(uuid, text)',
    'public.refund_sale(uuid, jsonb, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
  end loop;
end;
$$;

grant execute on function public.refunded_quantity(uuid)          to authenticated;
grant execute on function public.void_sale(uuid, text)            to authenticated;
grant execute on function public.refund_sale(uuid, jsonb, text)   to authenticated;
