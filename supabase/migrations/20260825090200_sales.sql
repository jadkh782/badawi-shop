-- ---------------------------------------------------------------------------
-- sales: one completed transaction.
-- The rate in force is frozen onto the row, so re-reading an old sale reproduces the exact
-- LBP figure the customer paid rather than re-converting it at today's rate.
-- ---------------------------------------------------------------------------
create table if not exists public.sales (
  id                uuid primary key default gen_random_uuid(),
  sold_at           timestamptz   not null default now(),
  subtotal_cents    integer       not null default 0 check (subtotal_cents >= 0),
  discount_type     text          not null default 'none'
                                  check (discount_type in ('none', 'percent', 'amount')),
  discount_value    numeric(12,2) not null default 0 check (discount_value >= 0),
  discount_cents    integer       not null default 0 check (discount_cents >= 0),
  total_cents       integer       not null default 0 check (total_cents >= 0),
  total_cost_cents  integer       not null default 0,
  profit_cents      integer       not null default 0,
  payment_currency  text          not null default 'USD' check (payment_currency in ('USD', 'LBP')),
  usd_to_lbp_rate   numeric(14,4) not null default 0,
  total_lbp         numeric(16,2) not null default 0,
  item_count        numeric(12,3) not null default 0,
  note              text,
  created_by        uuid          references auth.users (id) on delete set null,
  created_at        timestamptz   not null default now(),
  constraint sales_discount_within_subtotal check (discount_cents <= subtotal_cents)
);

-- Every report filters on sold_at, newest first.
create index if not exists sales_sold_at_idx on public.sales (sold_at desc);

-- ---------------------------------------------------------------------------
-- sale_items: the lines of a sale, with the product details copied in.
--
-- Snapshotting name, barcode, category, price and cost is what makes historical profit
-- correct: changing a price today, or deleting a product entirely, leaves last month's
-- numbers exactly as they were.
-- ---------------------------------------------------------------------------
create table if not exists public.sale_items (
  id                uuid primary key default gen_random_uuid(),
  sale_id           uuid          not null references public.sales (id) on delete cascade,
  product_id        uuid          references public.products (id) on delete set null,
  product_name      text          not null,
  barcode           text,
  category_name     text,
  unit              text          not null default 'piece',
  unit_price_cents  integer       not null check (unit_price_cents >= 0),
  unit_cost_cents   integer       not null check (unit_cost_cents >= 0),
  quantity          numeric(12,3) not null check (quantity > 0),
  line_total_cents  integer       not null,
  line_cost_cents   integer       not null,
  line_profit_cents integer       not null,
  created_at        timestamptz   not null default now()
);

create index if not exists sale_items_sale_idx on public.sale_items (sale_id);
create index if not exists sale_items_product_idx on public.sale_items (product_id);
-- Best-sellers group by the snapshotted name so deleted products still appear.
create index if not exists sale_items_name_idx on public.sale_items (product_name);

alter table public.stock_movements
  drop constraint if exists stock_movements_sale_id_fkey;
alter table public.stock_movements
  add constraint stock_movements_sale_id_fkey
  foreign key (sale_id) references public.sales (id) on delete set null;
