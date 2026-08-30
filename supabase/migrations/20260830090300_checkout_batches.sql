-- ---------------------------------------------------------------------------
-- checkout_sale, now taking the units off a particular batch.
--
-- The basket may name a batch per line. In average mode nothing ever does, and the sale
-- draws from the single batch the article has; in batch mode the till asks which price is
-- going over the counter and passes the answer through. A named batch that cannot cover the
-- line is topped up from the oldest remaining rather than refused, because the customer is
-- standing there and the totals come out right either way.
--
-- What each line cost is no longer read off the article. It is the sum of what those exact
-- units cost when they were bought, which is the entire point of keeping batches: sell the
-- ten you paid $15 for and the profit says $15, whatever the next delivery charged.
--
-- The allocation is written to sale_item_batches, and that record is what later lets a void
-- or a refund put the units back on the batch they left rather than repricing them by
-- accident.
-- ---------------------------------------------------------------------------

create table if not exists public.sale_item_batches (
  id              uuid          primary key default gen_random_uuid(),
  sale_item_id    uuid          not null references public.sale_items (id) on delete cascade,
  -- The batch may be collapsed away later by a switch to average mode, so this goes null
  -- rather than taking the history with it. The quantity and cost stay either way.
  batch_id        uuid          references public.stock_batches (id) on delete set null,
  quantity        numeric(12,3) not null check (quantity > 0),
  unit_cost_cents integer       not null check (unit_cost_cents >= 0),
  created_at      timestamptz   not null default now()
);

create index if not exists sale_item_batches_item_idx
  on public.sale_item_batches (sale_item_id);

create or replace function public.checkout_sale(
  p_items            jsonb,
  p_discount_type    text default 'none',
  p_discount_value   numeric default 0,
  p_payment_currency text default 'USD',
  p_note             text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id        uuid := gen_random_uuid();
  v_settings       public.app_settings%rowtype;
  v_line           record;
  v_product        record;
  v_subtotal       bigint := 0;
  v_cost           bigint := 0;
  v_items          numeric := 0;
  v_line_total     bigint;
  v_line_cost      bigint;
  v_discount_cents bigint := 0;
  v_total          bigint;
  v_total_lbp      numeric;
  v_item_id        uuid;
  v_alloc          jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to take a sale' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cannot check out an empty cart' using errcode = '22023';
  end if;

  if p_discount_type not in ('none', 'percent', 'amount') then
    raise exception 'Unknown discount type %', p_discount_type using errcode = '22023';
  end if;

  if p_payment_currency not in ('USD', 'LBP') then
    raise exception 'Unknown payment currency %', p_payment_currency using errcode = '22023';
  end if;

  select * into v_settings from public.app_settings where id = 1;

  insert into public.sales (id, payment_currency, discount_type, discount_value, note,
                            usd_to_lbp_rate, created_by)
  values (v_sale_id, p_payment_currency, p_discount_type, greatest(coalesce(p_discount_value, 0), 0),
          nullif(btrim(coalesce(p_note, '')), ''), v_settings.usd_to_lbp_rate, auth.uid());

  -- Folded on the article and the batch together. Scanning the same item twice still makes
  -- one line, but the same article taken from two different prices makes two, which is the
  -- truth of what left the shelf.
  for v_line in
    select (elem ->> 'product_id')::uuid as product_id,
           (elem ->> 'batch_id')::uuid   as batch_id,
           sum((elem ->> 'quantity')::numeric) as quantity
    from jsonb_array_elements(p_items) as elem
    group by 1, 2
    order by 1, 2
  loop
    if v_line.quantity is null or v_line.quantity <= 0 then
      raise exception 'Quantity must be greater than zero' using errcode = '22023';
    end if;

    select p.*, c.name as category_name
      into v_product
      from public.products p
      left join public.categories c on c.id = p.category_id
     where p.id = v_line.product_id
     for update of p;

    if not found then
      raise exception 'That product no longer exists' using errcode = '23503';
    end if;

    if v_product.quantity_in_stock < v_line.quantity then
      raise exception 'Only % % of "%" left in stock, % requested',
        v_product.quantity_in_stock, v_product.unit, v_product.name, v_line.quantity
        using errcode = 'BS001';
    end if;

    -- An article that has never been through a delivery has stock but no batches behind it,
    -- and the till is the wrong place to discover that. Levelled up first, priced at what
    -- the article says it costs.
    perform public.reconcile_batches(v_line.product_id, v_product.quantity_in_stock);

    -- Take the units first: what they cost is an answer, not an assumption.
    v_alloc := public.consume_batches(v_line.product_id, v_line.quantity, v_line.batch_id);

    select coalesce(round(sum((elem ->> 'quantity')::numeric
                              * (elem ->> 'unit_cost_cents')::numeric)), 0)
      into v_line_cost
      from jsonb_array_elements(v_alloc) as elem;

    v_line_total := round(v_product.sale_price_cents * v_line.quantity);

    insert into public.sale_items (
      sale_id, product_id, product_name, barcode, category_name, unit,
      unit_price_cents, unit_cost_cents, quantity,
      line_total_cents, line_cost_cents, line_profit_cents
    ) values (
      v_sale_id, v_product.id, v_product.name, v_product.barcode, v_product.category_name,
      v_product.unit, v_product.sale_price_cents, round(v_line_cost / v_line.quantity),
      v_line.quantity, v_line_total, v_line_cost, v_line_total - v_line_cost
    )
    returning id into v_item_id;

    insert into public.sale_item_batches (sale_item_id, batch_id, quantity, unit_cost_cents)
    select v_item_id,
           (elem ->> 'batch_id')::uuid,
           (elem ->> 'quantity')::numeric,
           (elem ->> 'unit_cost_cents')::integer
    from jsonb_array_elements(v_alloc) as elem;

    update public.products
       set quantity_in_stock = quantity_in_stock - v_line.quantity
     where id = v_product.id;

    -- Selling the last of an old batch changes what the shelf is worth, so the article's
    -- cost is restated from what is left rather than left standing at yesterday's blend.
    perform public.sync_cost_from_batches(v_product.id);

    insert into public.stock_movements (product_id, delta, reason, sale_id, created_by)
    values (v_product.id, -v_line.quantity, 'sale', v_sale_id, auth.uid());

    v_subtotal := v_subtotal + v_line_total;
    v_cost     := v_cost + v_line_cost;
    v_items    := v_items + v_line.quantity;
  end loop;

  v_discount_cents := case p_discount_type
    when 'percent' then round(v_subtotal * least(greatest(coalesce(p_discount_value, 0), 0), 100) / 100.0)
    when 'amount'  then round(greatest(coalesce(p_discount_value, 0), 0) * 100)
    else 0
  end;
  v_discount_cents := least(v_discount_cents, v_subtotal);

  v_total := v_subtotal - v_discount_cents;
  v_total_lbp := round((v_total / 100.0) * v_settings.usd_to_lbp_rate / v_settings.lbp_rounding)
                 * v_settings.lbp_rounding;

  update public.sales
     set subtotal_cents   = v_subtotal,
         discount_cents   = v_discount_cents,
         total_cents      = v_total,
         total_cost_cents = v_cost,
         profit_cents     = v_total - v_cost,
         item_count       = v_items,
         total_lbp        = v_total_lbp
   where id = v_sale_id;

  if v_total > 0 then
    insert into public.cash_movements (kind, amount_cents, sale_id, note, created_by)
    values ('sale', v_total, v_sale_id, null, auth.uid());
  end if;

  return v_sale_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- What is on the shelf, priced. The till reads this to know whether it has to ask.
--
-- One row back means one price and no question. Two or more means the article is holding
-- stock bought at different prices, and which one is going over the counter is a fact only
-- the person at the counter knows.
-- ---------------------------------------------------------------------------
create or replace function public.list_stock_batches(p_product_id uuid)
returns table (
  id                 uuid,
  unit_cost_cents    integer,
  quantity_remaining numeric,
  quantity_received  numeric,
  source             text,
  note               text,
  received_at        timestamptz
)
language sql
stable
as $$
  select b.id, b.unit_cost_cents, b.quantity_remaining, b.quantity_received,
         b.source, b.note, b.received_at
  from public.stock_batches b
  where b.product_id = p_product_id
    and b.quantity_remaining > 0
  order by b.received_at, b.id;
$$;

-- The price trail for one article, newest first.
create or replace function public.list_price_history(p_product_id uuid, p_limit integer default 50)
returns table (
  id                   uuid,
  changed_at           timestamptz,
  source               text,
  quantity             numeric,
  purchase_cost_cents  integer,
  old_cost_cents       integer,
  new_cost_cents       integer,
  old_sale_price_cents integer,
  new_sale_price_cents integer,
  note                 text
)
language sql
stable
as $$
  select h.id, h.changed_at, h.source, h.quantity, h.purchase_cost_cents,
         h.old_cost_cents, h.new_cost_cents, h.old_sale_price_cents, h.new_sale_price_cents,
         h.note
  from public.product_price_history h
  where h.product_id = p_product_id
  order by h.changed_at desc, h.id desc
  limit greatest(coalesce(p_limit, 50), 1);
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.list_stock_batches(uuid)',
    'public.list_price_history(uuid, integer)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;

revoke all on function public.checkout_sale(jsonb, text, numeric, text, text) from public, anon;
grant execute on function public.checkout_sale(jsonb, text, numeric, text, text) to authenticated;
