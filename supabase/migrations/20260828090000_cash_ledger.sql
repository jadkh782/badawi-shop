-- ---------------------------------------------------------------------------
-- cash_movements: where the shop's money went.
--
-- A running cash box. Takings go in, restocking takes out, and the balance is what is
-- available to spend on the next delivery.
--
-- Sales add the full amount the customer paid, not the profit on it. That sounds wrong until
-- you follow one item through: sell for $100 having paid $60, then buy another for $60. Add
-- the takings and subtract the purchase and the box holds $40, which is the profit. Add only
-- the profit and subtract the purchase and it holds -$20, having charged the $60 twice.
--
-- Amounts are signed: positive is money in, negative is money out. The balance is their sum,
-- so it can always be explained by listing the rows that made it.
--
-- Everything is in USD cents like the rest of the system, whichever currency was handed over.
-- ---------------------------------------------------------------------------
create table if not exists public.cash_movements (
  id            uuid primary key default gen_random_uuid(),
  kind          text        not null check (kind in ('sale', 'restock', 'investment')),
  amount_cents  bigint      not null,
  sale_id       uuid        references public.sales (id) on delete cascade,
  product_id    uuid        references public.products (id) on delete set null,
  product_name  text,
  note          text,
  created_by    uuid        references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),

  -- Money in is positive, money out is negative. Nothing else makes sense per kind.
  constraint cash_direction check (
    (kind = 'sale'       and amount_cents >= 0) or
    (kind = 'investment' and amount_cents >= 0) or
    (kind = 'restock'    and amount_cents <= 0)
  )
);

create index if not exists cash_movements_created_idx
  on public.cash_movements (created_at desc);

alter table public.cash_movements enable row level security;

drop policy if exists cash_movements_read on public.cash_movements;
create policy cash_movements_read on public.cash_movements
  for select to authenticated using (true);

-- Written only by checkout_sale and adjust_stock, both of which run as the owner, so the
-- balance can never be moved by a device posting a figure of its own.
revoke all on public.cash_movements from authenticated;
grant select on public.cash_movements to authenticated;
revoke all on public.cash_movements from anon;
