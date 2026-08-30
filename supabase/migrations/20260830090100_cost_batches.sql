-- ---------------------------------------------------------------------------
-- What a thing cost, when the answer stopped being one number.
--
-- A supplier's price moves. Buy ten at $15, sell none, then buy ten more at $20 and the
-- shelf holds twenty units that did not cost the same as each other. There are two honest
-- answers to "what did this cost", and the shop picks which one it wants:
--
--   average   the twenty units are treated as costing $17.50 each. One number per article,
--             no questions at the till, and profit is right across the stock as a whole.
--
--   batch     the ten at $15 and the ten at $20 stay apart. Selling asks which of the two
--             is going over the counter, and profit is exact per unit. The question stops
--             asking itself the moment the older price sells out, because then there is
--             only one batch left and nothing to choose between.
--
-- Either way the batches are kept, so the two modes are the same bookkeeping read two ways
-- and switching between them is defined rather than destructive. The invariant that makes
-- that work: the remaining quantities across an article's batches always add up to exactly
-- its quantity_in_stock.
-- ---------------------------------------------------------------------------

alter table public.app_settings
  add column if not exists cost_method text not null default 'average';
alter table public.app_settings
  drop constraint if exists app_settings_cost_method_check;
alter table public.app_settings
  add constraint app_settings_cost_method_check check (cost_method in ('average', 'batch'));

-- The price the last delivery was actually charged at, kept beside the costing figure.
-- In average mode cost_price_cents is a blend and this is the real number the supplier said,
-- which is the one worth seeing when deciding what to charge.
alter table public.products
  add column if not exists last_cost_price_cents integer;

-- ---------------------------------------------------------------------------
-- stock_batches: units on the shelf, grouped by what they cost.
-- ---------------------------------------------------------------------------
create table if not exists public.stock_batches (
  id                 uuid          primary key default gen_random_uuid(),
  product_id         uuid          not null references public.products (id) on delete cascade,
  unit_cost_cents    integer       not null check (unit_cost_cents >= 0),
  quantity_received  numeric(12,3) not null check (quantity_received >= 0),
  quantity_remaining numeric(12,3) not null check (quantity_remaining >= 0),
  source             text          not null default 'restock'
                                   check (source in ('opening', 'restock', 'average', 'correction')),
  note               text,
  received_at        timestamptz   not null default now(),
  created_by         uuid          references auth.users (id) on delete set null,

  -- A batch can give back units it already handed out, when a sale is voided or returned,
  -- but it can never hold more than it took in.
  constraint stock_batches_within_received check (quantity_remaining <= quantity_received)
);

-- Oldest first is the order every allocation walks in, so it is the order the index keeps.
create index if not exists stock_batches_open_idx
  on public.stock_batches (product_id, received_at, id)
  where quantity_remaining > 0;

-- ---------------------------------------------------------------------------
-- product_price_history: every time a price moved, and what moved it.
-- ---------------------------------------------------------------------------
create table if not exists public.product_price_history (
  id                   uuid          primary key default gen_random_uuid(),
  product_id           uuid          not null references public.products (id) on delete cascade,
  changed_at           timestamptz   not null default now(),
  source               text          not null
                                     check (source in ('opening', 'restock', 'manual', 'method')),
  quantity             numeric(12,3),
  stock_before         numeric(12,3),
  stock_after          numeric(12,3),
  -- What this particular delivery was charged at, per unit. Null for a hand edit.
  purchase_cost_cents  integer,
  old_cost_cents       integer       not null,
  new_cost_cents       integer       not null,
  old_sale_price_cents integer       not null,
  new_sale_price_cents integer       not null,
  note                 text,
  created_by           uuid          references auth.users (id) on delete set null
);

create index if not exists product_price_history_idx
  on public.product_price_history (product_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- Backfill: every article already holding stock gets the batch it should always have had.
--
-- Guarded on there being none, so this runs once however many times the schema is applied.
-- ---------------------------------------------------------------------------
insert into public.stock_batches
  (product_id, unit_cost_cents, quantity_received, quantity_remaining, source, note)
select p.id, p.cost_price_cents, p.quantity_in_stock, p.quantity_in_stock, 'opening',
       'Stock already on the shelf when batches were introduced'
from public.products p
where p.quantity_in_stock > 0
  and not exists (select 1 from public.stock_batches b where b.product_id = p.id);

-- ---------------------------------------------------------------------------
-- reconcile_batches: make the batches agree with the shelf.
--
-- quantity_in_stock is the figure the shop counts and trusts. The batches are a story about
-- where that figure came from, and a story can go missing: a row inserted straight into the
-- products table, an import, an article that predates any of this. Rather than refuse to
-- sell something that is visibly on the shelf, the gap is filled with a batch priced at what
-- the article says it costs, which is exactly how the whole system costed things before
-- batches existed.
--
-- The opposite drift is possible too, if stock is written down behind the ledger's back, and
-- is trimmed off the newest batches so the oldest prices survive to be sold at.
-- ---------------------------------------------------------------------------
create or replace function public.reconcile_batches(p_product_id uuid, p_expected numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_have  numeric;
  v_cost  integer;
  v_over  numeric;
  v_batch record;
  v_drop  numeric;
begin
  if p_expected is null or p_expected < 0 then
    return;
  end if;

  select coalesce(sum(quantity_remaining), 0) into v_have
    from public.stock_batches
   where product_id = p_product_id and quantity_remaining > 0;

  if v_have = p_expected then
    return;
  end if;

  if v_have < p_expected then
    select cost_price_cents into v_cost from public.products where id = p_product_id;

    insert into public.stock_batches
      (product_id, unit_cost_cents, quantity_received, quantity_remaining, source, note)
    values (p_product_id, greatest(coalesce(v_cost, 0), 0),
            p_expected - v_have, p_expected - v_have, 'opening',
            'Stock on the shelf with no purchase behind it');
    return;
  end if;

  -- More in the batches than on the shelf. Newest first, so the oldest prices are the ones
  -- left standing to be sold at.
  v_over := v_have - p_expected;

  for v_batch in
    select * from public.stock_batches
     where product_id = p_product_id and quantity_remaining > 0
     order by received_at desc, id desc
     for update
  loop
    exit when v_over <= 0;

    v_drop := least(v_batch.quantity_remaining, v_over);
    update public.stock_batches
       set quantity_remaining = quantity_remaining - v_drop
     where id = v_batch.id;
    v_over := v_over - v_drop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- consume_batches: take a quantity off the shelf and say what it cost.
--
-- A preferred batch is honoured first, which is the till answering "the older ones". Once
-- that batch is exhausted the rest comes from the oldest remaining, so a line that spans two
-- prices is priced across both rather than refused.
--
-- Returns the allocation it made, which the caller stores: it is the only way a void or a
-- refund can later put the units back where they came from.
-- ---------------------------------------------------------------------------
create or replace function public.consume_batches(
  p_product_id uuid,
  p_quantity   numeric,
  p_batch_id   uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left  numeric := p_quantity;
  v_take  numeric;
  v_batch record;
  v_out   jsonb := '[]'::jsonb;
begin
  if p_quantity is null or p_quantity <= 0 then
    return v_out;
  end if;

  for v_batch in
    select * from public.stock_batches
     where product_id = p_product_id
       and quantity_remaining > 0
     -- The chosen batch first, everything else oldest first.
     order by (id is distinct from p_batch_id), received_at, id
     for update
  loop
    exit when v_left <= 0;

    v_take := least(v_batch.quantity_remaining, v_left);

    update public.stock_batches
       set quantity_remaining = quantity_remaining - v_take
     where id = v_batch.id;

    v_out := v_out || jsonb_build_object(
      'batch_id', v_batch.id,
      'quantity', v_take,
      'unit_cost_cents', v_batch.unit_cost_cents
    );
    v_left := v_left - v_take;
  end loop;

  if v_left > 0 then
    -- The batches and the stock count disagreeing is a bug, not a shop problem, so it says
    -- so plainly rather than quietly selling units that are not accounted for.
    raise exception 'Stock records for this article do not add up: % units unaccounted for', v_left
      using errcode = 'BS002';
  end if;

  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- return_to_batches: the reverse, used by voids and refunds.
--
-- Units go back to the batch they left, so an article sold at the old price and handed back
-- is once again stock at the old price rather than silently repriced.
-- ---------------------------------------------------------------------------
create or replace function public.return_to_batches(p_allocations jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
begin
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    return;
  end if;

  for v_line in
    select (elem ->> 'batch_id')::uuid as batch_id,
           sum((elem ->> 'quantity')::numeric) as quantity
    from jsonb_array_elements(p_allocations) as elem
    group by 1
    order by 1
  loop
    update public.stock_batches
       set quantity_remaining = least(quantity_received, quantity_remaining + v_line.quantity)
     where id = v_line.batch_id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- collapse_to_average: fold every open batch of an article into one.
--
-- This is what average mode means in practice. The weighted average is taken over what is
-- still on the shelf, not over everything ever bought, because the question being answered
-- is "what did the stock I am holding cost me".
--
-- Returns the resulting unit cost, or null when there is nothing left to average.
-- ---------------------------------------------------------------------------
create or replace function public.collapse_to_average(p_product_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty  numeric;
  v_cost numeric;
  v_unit integer;
begin
  select coalesce(sum(quantity_remaining), 0),
         coalesce(sum(quantity_remaining * unit_cost_cents), 0)
    into v_qty, v_cost
    from public.stock_batches
   where product_id = p_product_id
     and quantity_remaining > 0;

  -- Spent batches are history and are kept; only the open ones are being merged. The delete
  -- below takes the locks; an aggregate cannot carry FOR UPDATE of its own.
  delete from public.stock_batches
   where product_id = p_product_id and quantity_remaining > 0;

  if v_qty <= 0 then
    return null;
  end if;

  v_unit := round(v_cost / v_qty);

  insert into public.stock_batches
    (product_id, unit_cost_cents, quantity_received, quantity_remaining, source, note)
  values (p_product_id, v_unit, v_qty, v_qty, 'average', 'Averaged across the stock on hand');

  return v_unit;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_cost_method: switching how the shop counts cost.
--
-- Going to average folds every article's open batches into one at its weighted average, so
-- the till stops asking and the cost on each article becomes that blend. Going the other way
-- changes nothing that exists: the single batch each article holds is simply where the next
-- delivery starts appending beside rather than merging into.
-- ---------------------------------------------------------------------------
create or replace function public.set_cost_method(p_method text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product record;
  v_unit    integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to change how cost is counted' using errcode = '42501';
  end if;

  if p_method not in ('average', 'batch') then
    raise exception 'Unknown cost method %', p_method using errcode = '22023';
  end if;

  update public.app_settings set cost_method = p_method where id = 1;

  if p_method = 'average' then
    for v_product in select id, cost_price_cents, sale_price_cents from public.products loop
      v_unit := public.collapse_to_average(v_product.id);

      if v_unit is not null and v_unit is distinct from v_product.cost_price_cents then
        update public.products set cost_price_cents = v_unit where id = v_product.id;

        insert into public.product_price_history (
          product_id, source, old_cost_cents, new_cost_cents,
          old_sale_price_cents, new_sale_price_cents, note, created_by
        ) values (
          v_product.id, 'method', v_product.cost_price_cents, v_unit,
          v_product.sale_price_cents, v_product.sale_price_cents,
          'Switched to average cost', auth.uid()
        );
      end if;
    end loop;
  end if;

  return p_method;
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.reconcile_batches(uuid, numeric)',
    'public.consume_batches(uuid, numeric, uuid)',
    'public.return_to_batches(jsonb)',
    'public.collapse_to_average(uuid)',
    'public.set_cost_method(text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
  end loop;
end;
$$;

-- Only set_cost_method is called from a screen. The three helpers are internal plumbing for
-- checkout_sale and adjust_stock, and stay unreachable from any device.
grant execute on function public.set_cost_method(text) to authenticated;
