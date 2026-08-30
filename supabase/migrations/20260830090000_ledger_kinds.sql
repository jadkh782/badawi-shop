-- ---------------------------------------------------------------------------
-- The cash box learns four more ways money moves.
--
-- Until now the ledger knew about three things: a sale coming in, a delivery going out, and
-- the owner putting money in from their own pocket. Four more were happening in the shop
-- without leaving a trace:
--
--   opening      the first stock of a brand new article, which is a purchase like any other
--                and was previously written straight into the products table with no entry
--                at all, so the balance simply ignored it.
--   correction   a miscount found on the shelf. Stock that is there and was not on the books
--                was paid for by someone, so the balance has to come down to account for it;
--                stock that is missing was never really bought, so the balance goes back up.
--   void        a sale rung up in error and taken back out again.
--   refund      goods returned by a customer and paid back over the counter.
--
-- A correction is the one kind that can point either way, so the direction constraint is
-- written out per kind rather than as one rule with exceptions.
-- ---------------------------------------------------------------------------

alter table public.cash_movements
  drop constraint if exists cash_movements_kind_check;
alter table public.cash_movements
  add constraint cash_movements_kind_check check (
    kind in ('sale', 'restock', 'opening', 'investment', 'correction', 'void', 'refund')
  );

alter table public.cash_movements
  drop constraint if exists cash_direction;
alter table public.cash_movements
  add constraint cash_direction check (
    (kind = 'sale'       and amount_cents >= 0) or
    (kind = 'investment' and amount_cents >= 0) or
    (kind = 'restock'    and amount_cents <= 0) or
    (kind = 'opening'    and amount_cents <= 0) or
    (kind = 'void'       and amount_cents <= 0) or
    (kind = 'refund'     and amount_cents <= 0) or
    -- Found stock costs money, missing stock gives it back. Both are corrections.
    (kind = 'correction')
  );

-- ---------------------------------------------------------------------------
-- The stock ledger gains the two reasons that put units back on the shelf.
-- ---------------------------------------------------------------------------
alter table public.stock_movements
  drop constraint if exists stock_movements_reason_check;
alter table public.stock_movements
  add constraint stock_movements_reason_check check (
    reason in ('sale', 'restock', 'adjustment', 'initial', 'void', 'refund')
  );

-- ---------------------------------------------------------------------------
-- The balance, broken out far enough that every part of it can be pointed at.
--
-- Money that went out is reported as the positive amount that left, because "spent 40" reads
-- as what happened and "-40" reads as a figure someone has to interpret. Corrections keep
-- their sign, since which way they went is the whole point of them.
-- ---------------------------------------------------------------------------
drop function if exists public.report_budget();

create or replace function public.report_budget()
returns table (
  balance_cents        bigint,
  from_sales_cents     bigint,
  spent_restock_cents  bigint,
  spent_opening_cents  bigint,
  invested_cents       bigint,
  corrections_cents    bigint,
  refunded_cents       bigint,
  voided_cents         bigint,
  entry_count          bigint
)
language sql
stable
as $$
  select
    coalesce(sum(amount_cents), 0)::bigint,
    coalesce(sum(amount_cents) filter (where kind = 'sale'), 0)::bigint,
    coalesce(-sum(amount_cents) filter (where kind = 'restock'), 0)::bigint,
    coalesce(-sum(amount_cents) filter (where kind = 'opening'), 0)::bigint,
    coalesce(sum(amount_cents) filter (where kind = 'investment'), 0)::bigint,
    coalesce(sum(amount_cents) filter (where kind = 'correction'), 0)::bigint,
    coalesce(-sum(amount_cents) filter (where kind = 'refund'), 0)::bigint,
    coalesce(-sum(amount_cents) filter (where kind = 'void'), 0)::bigint,
    count(*)::bigint
  from public.cash_movements;
$$;

-- ---------------------------------------------------------------------------
-- What the shelves are worth.
--
-- The cash box says what there is to spend. This says what has already been spent and is
-- still sitting on the shelf waiting to be sold, which is the other half of knowing whether
-- the shop is doing well: a low balance with a full stockroom is a different situation
-- entirely from a low balance with nothing on the shelves.
-- ---------------------------------------------------------------------------
create or replace function public.report_inventory_value()
returns table (
  cost_value_cents   bigint,
  retail_value_cents bigint,
  article_count      bigint,
  unit_count         numeric
)
language sql
stable
as $$
  select
    coalesce(sum(round(p.cost_price_cents * p.quantity_in_stock)), 0)::bigint,
    coalesce(sum(round(p.sale_price_cents * p.quantity_in_stock)), 0)::bigint,
    count(*) filter (where p.quantity_in_stock > 0)::bigint,
    coalesce(sum(p.quantity_in_stock), 0)::numeric
  from public.products p
  where p.is_active;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.report_budget()',
    'public.report_inventory_value()'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
