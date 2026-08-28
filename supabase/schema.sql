-- Badawi Shop: the whole database in one file.
--
-- Paste this into the Supabase SQL editor and run it once. It is every migration in
-- supabase/migrations/ concatenated in order, so it does the same job as `npm run db:push`
-- without needing the CLI, a project link, or the database password.
--
-- Running it more than once is harmless: everything here is create-if-not-exists or replaced.


-- ==========================================================================
-- 20260825090000_core_schema.sql
-- ==========================================================================
-- Badawi Shop: core inventory schema.
-- USD is the single source of truth for every price. Amounts are integer cents so no total
-- ever depends on binary floating point. LBP is derived from app_settings at display time and
-- frozen onto each sale row at the moment it is taken.

create extension if not exists pg_trgm;

-- Keeps updated_at honest without the application having to remember.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- app_settings: exactly one row, enforced by the primary key check.
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  id               smallint primary key default 1 check (id = 1),
  shop_name        text        not null default 'Badawi Shop',
  usd_to_lbp_rate  numeric(14,4) not null default 89000 check (usd_to_lbp_rate > 0),
  lbp_rounding     integer     not null default 1000 check (lbp_rounding >= 1),
  rate_updated_at  timestamptz,
  updated_at       timestamptz not null default now()
);

drop trigger if exists app_settings_touch on public.app_settings;
create trigger app_settings_touch
  before update on public.app_settings
  for each row execute function public.touch_updated_at();

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- categories: the grouping used both to organise inventory and to browse in Sell mode.
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  color       text        not null default '#64748b',
  sort_order  integer     not null default 0,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Case-insensitive uniqueness: "Drinks" and "drinks" are the same shelf.
create unique index if not exists categories_name_unique
  on public.categories (lower(name));

create index if not exists categories_sort_idx
  on public.categories (sort_order, name) where is_active;

drop trigger if exists categories_touch on public.categories;
create trigger categories_touch
  before update on public.categories
  for each row execute function public.touch_updated_at();


-- ==========================================================================
-- 20260825090100_products.sql
-- ==========================================================================
-- ---------------------------------------------------------------------------
-- products: one row per article on the shelf.
-- barcode is nullable so loose goods, which are sold by tapping a category in Sell mode,
-- are first-class rather than a special case.
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id                   uuid primary key default gen_random_uuid(),
  barcode              text,
  name                 text          not null check (length(btrim(name)) > 0),
  category_id          uuid          references public.categories (id) on delete set null,
  cost_price_cents     integer       not null default 0 check (cost_price_cents >= 0),
  sale_price_cents     integer       not null default 0 check (sale_price_cents >= 0),
  quantity_in_stock    numeric(12,3) not null default 0,
  low_stock_threshold  numeric(12,3) not null default 0 check (low_stock_threshold >= 0),
  unit                 text          not null default 'piece',
  notes                text,
  is_active            boolean       not null default true,
  created_at           timestamptz   not null default now(),
  updated_at           timestamptz   not null default now()
);

-- A barcode identifies one article. Partial index so any number of products may have none.
create unique index if not exists products_barcode_unique
  on public.products (barcode) where barcode is not null;

create index if not exists products_category_idx
  on public.products (category_id) where is_active;

-- Trigram index backing the "search by name" box, which needs to match mid-word.
create index if not exists products_name_trgm_idx
  on public.products using gin (name gin_trgm_ops);

-- Drives the restocking list without a sequential scan over the catalogue.
create index if not exists products_low_stock_idx
  on public.products (quantity_in_stock) where is_active;

drop trigger if exists products_touch on public.products;
create trigger products_touch
  before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- stock_movements: an append-only ledger of every change to a stock level, so a surprising
-- count can always be traced back to the sale or adjustment that caused it.
-- ---------------------------------------------------------------------------
create table if not exists public.stock_movements (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid          not null references public.products (id) on delete cascade,
  delta       numeric(12,3) not null,
  reason      text          not null check (reason in ('sale', 'restock', 'adjustment', 'initial')),
  sale_id     uuid,
  note        text,
  created_by  uuid          references auth.users (id) on delete set null,
  created_at  timestamptz   not null default now()
);

create index if not exists stock_movements_product_idx
  on public.stock_movements (product_id, created_at desc);


-- ==========================================================================
-- 20260825090200_sales.sql
-- ==========================================================================
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


-- ==========================================================================
-- 20260825090300_rls.sql
-- ==========================================================================
-- ---------------------------------------------------------------------------
-- Row level security.
--
-- The shop runs on one shared account, so the rule is simple: a signed-in session may work
-- with the whole catalogue, and an anonymous visitor may do nothing at all. The anon key
-- shipped in the browser bundle is therefore useless without a login.
--
-- Money tables are deliberately read-only from the client. Sales are written only through
-- checkout_sale, and stock only through checkout_sale or adjust_stock, both SECURITY DEFINER.
-- That means a total can never be posted from a device that computed it itself.
-- ---------------------------------------------------------------------------

alter table public.app_settings    enable row level security;
alter table public.categories      enable row level security;
alter table public.products        enable row level security;
alter table public.sales           enable row level security;
alter table public.sale_items      enable row level security;
alter table public.stock_movements enable row level security;

-- Settings: readable and tunable by the shop.
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select to authenticated using (true);
drop policy if exists app_settings_update on public.app_settings;
create policy app_settings_update on public.app_settings
  for update to authenticated using (true) with check (true);

-- Categories: full control.
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories
  for select to authenticated using (true);
drop policy if exists categories_insert on public.categories;
create policy categories_insert on public.categories
  for insert to authenticated with check (true);
drop policy if exists categories_update on public.categories;
create policy categories_update on public.categories
  for update to authenticated using (true) with check (true);
drop policy if exists categories_delete on public.categories;
create policy categories_delete on public.categories
  for delete to authenticated using (true);

-- Products: full control. Stock is edited through adjust_stock, but the rest of the record
-- is ordinary data the shop maintains directly.
drop policy if exists products_read on public.products;
create policy products_read on public.products
  for select to authenticated using (true);
drop policy if exists products_insert on public.products;
create policy products_insert on public.products
  for insert to authenticated with check (true);
drop policy if exists products_update on public.products;
create policy products_update on public.products
  for update to authenticated using (true) with check (true);
drop policy if exists products_delete on public.products;
create policy products_delete on public.products
  for delete to authenticated using (true);

-- Sales and their lines: readable for reporting, never written directly.
drop policy if exists sales_read on public.sales;
create policy sales_read on public.sales
  for select to authenticated using (true);
drop policy if exists sale_items_read on public.sale_items;
create policy sale_items_read on public.sale_items
  for select to authenticated using (true);

-- The stock ledger is an audit trail: readable, append-only through the functions.
drop policy if exists stock_movements_read on public.stock_movements;
create policy stock_movements_read on public.stock_movements
  for select to authenticated using (true);


-- ==========================================================================
-- 20260825090400_checkout.sql
-- ==========================================================================
-- ---------------------------------------------------------------------------
-- checkout_sale: turns a basket into a sale, atomically.
--
-- The client sends product ids, quantities and the discount the cashier chose. It does NOT
-- send any price or total. Everything is recomputed here from the catalogue, so a tampered
-- or merely stale device cannot post a wrong figure.
--
-- Rows are locked in product-id order, which means two tills checking out overlapping
-- baskets at the same moment queue up instead of deadlocking, and the second one sees the
-- stock the first one already took.
--
-- Raises SQLSTATE BS001 when the shelf cannot cover the basket.
-- ---------------------------------------------------------------------------
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

  -- Duplicate ids in the payload are folded together, so scanning the same item twice in two
  -- separate lines still results in one sale line and one stock deduction.
  for v_line in
    select (elem ->> 'product_id')::uuid as product_id,
           sum((elem ->> 'quantity')::numeric) as quantity
    from jsonb_array_elements(p_items) as elem
    group by 1
    order by 1
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

    v_line_total := round(v_product.sale_price_cents * v_line.quantity);
    v_line_cost  := round(v_product.cost_price_cents * v_line.quantity);

    insert into public.sale_items (
      sale_id, product_id, product_name, barcode, category_name, unit,
      unit_price_cents, unit_cost_cents, quantity,
      line_total_cents, line_cost_cents, line_profit_cents
    ) values (
      v_sale_id, v_product.id, v_product.name, v_product.barcode, v_product.category_name,
      v_product.unit, v_product.sale_price_cents, v_product.cost_price_cents, v_line.quantity,
      v_line_total, v_line_cost, v_line_total - v_line_cost
    );

    update public.products
       set quantity_in_stock = quantity_in_stock - v_line.quantity
     where id = v_product.id;

    insert into public.stock_movements (product_id, delta, reason, sale_id, created_by)
    values (v_product.id, -v_line.quantity, 'sale', v_sale_id, auth.uid());

    v_subtotal := v_subtotal + v_line_total;
    v_cost     := v_cost + v_line_cost;
    v_items    := v_items + v_line.quantity;
  end loop;

  -- The discount is applied to the recomputed subtotal and clamped, so it can never turn a
  -- sale into a payout however the request was crafted.
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

  return v_sale_id;
end;
$$;

revoke all on function public.checkout_sale(jsonb, text, numeric, text, text) from public, anon;
grant execute on function public.checkout_sale(jsonb, text, numeric, text, text) to authenticated;


-- ==========================================================================
-- 20260825090500_adjust_stock.sql
-- ==========================================================================
-- ---------------------------------------------------------------------------
-- adjust_stock: the one way stock moves outside of a sale.
--
-- Restocking a shelf and correcting a miscount are the same operation with a different
-- reason, and both must write the ledger entry in the same transaction as the stock change,
-- which is why neither is a plain UPDATE from the client.
-- ---------------------------------------------------------------------------
create or replace function public.adjust_stock(
  p_product_id uuid,
  p_delta      numeric,
  p_reason     text default 'restock',
  p_note       text default null
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_new     numeric;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to change stock' using errcode = '42501';
  end if;

  if p_reason not in ('restock', 'adjustment', 'initial') then
    raise exception 'Unknown stock reason %', p_reason using errcode = '22023';
  end if;

  if p_delta is null or p_delta = 0 then
    raise exception 'Stock change must be a non-zero amount' using errcode = '22023';
  end if;

  select * into v_product from public.products where id = p_product_id for update;

  if not found then
    raise exception 'That product no longer exists' using errcode = '23503';
  end if;

  v_new := v_product.quantity_in_stock + p_delta;

  if v_new < 0 then
    raise exception 'That would leave "%" at % %, below zero',
      v_product.name, v_new, v_product.unit using errcode = 'BS001';
  end if;

  update public.products set quantity_in_stock = v_new where id = p_product_id;

  insert into public.stock_movements (product_id, delta, reason, note, created_by)
  values (p_product_id, p_delta, p_reason, nullif(btrim(coalesce(p_note, '')), ''), auth.uid());

  return v_new;
end;
$$;

revoke all on function public.adjust_stock(uuid, numeric, text, text) from public, anon;
grant execute on function public.adjust_stock(uuid, numeric, text, text) to authenticated;


-- ==========================================================================
-- 20260825090600_report_view.sql
-- ==========================================================================
-- ---------------------------------------------------------------------------
-- sale_line_facts: the single shape every report reads from.
--
-- A discount is taken against the whole basket, but reporting needs to know what each
-- product actually earned. The discount is therefore spread across the lines in proportion
-- to their value, so revenue per product, per category and per day all add back up to the
-- sale total instead of overstating it by the discount.
--
-- security_invoker means the view is subject to the same row level security as the tables
-- underneath it, rather than quietly running with the owner rights.
-- ---------------------------------------------------------------------------
create or replace view public.sale_line_facts
with (security_invoker = on) as
select
  si.id,
  si.sale_id,
  s.sold_at,
  s.payment_currency,
  si.product_id,
  si.product_name,
  si.barcode,
  coalesce(si.category_name, 'Uncategorised') as category_name,
  si.unit,
  si.quantity,
  si.unit_price_cents,
  si.unit_cost_cents,
  si.line_total_cents as gross_cents,
  si.line_cost_cents  as cost_cents,
  (si.line_total_cents - case
     when s.subtotal_cents > 0
       then round(s.discount_cents::numeric * si.line_total_cents / s.subtotal_cents)
     else 0
   end)::bigint as net_cents,
  (si.line_total_cents - case
     when s.subtotal_cents > 0
       then round(s.discount_cents::numeric * si.line_total_cents / s.subtotal_cents)
     else 0
   end - si.line_cost_cents)::bigint as net_profit_cents
from public.sale_items si
join public.sales s on s.id = si.sale_id;

grant select on public.sale_line_facts to authenticated;


-- ==========================================================================
-- 20260825090700_reports.sql
-- ==========================================================================
-- ---------------------------------------------------------------------------
-- Reporting functions. Aggregation happens in Postgres so the phone downloads a handful of
-- rows rather than the sales table.
-- ---------------------------------------------------------------------------

create or replace function public.report_summary(p_from timestamptz, p_to timestamptz)
returns table (
  total_sales_cents    bigint,
  total_cost_cents     bigint,
  total_profit_cents   bigint,
  total_discount_cents bigint,
  transaction_count    bigint,
  items_sold           numeric,
  paid_usd_cents       bigint,
  paid_lbp_cents       bigint
)
language sql
stable
as $$
  select
    coalesce(sum(total_cents), 0)::bigint,
    coalesce(sum(total_cost_cents), 0)::bigint,
    coalesce(sum(profit_cents), 0)::bigint,
    coalesce(sum(discount_cents), 0)::bigint,
    count(*)::bigint,
    coalesce(sum(item_count), 0)::numeric,
    coalesce(sum(total_cents) filter (where payment_currency = 'USD'), 0)::bigint,
    coalesce(sum(total_cents) filter (where payment_currency = 'LBP'), 0)::bigint
  from public.sales
  where sold_at >= p_from and sold_at < p_to;
$$;

-- Best sellers. Grouped on the snapshotted name so an article that has since been deleted
-- still shows up in the month it sold.
create or replace function public.report_top_products(
  p_from timestamptz, p_to timestamptz, p_limit integer default 20
)
returns table (
  product_id    uuid,
  product_name  text,
  barcode       text,
  category_name text,
  quantity_sold numeric,
  revenue_cents bigint,
  profit_cents  bigint
)
language sql
stable
as $$
  select
    (array_agg(f.product_id) filter (where f.product_id is not null))[1],
    f.product_name,
    max(f.barcode),
    max(f.category_name),
    sum(f.quantity)::numeric,
    sum(f.net_cents)::bigint,
    sum(f.net_profit_cents)::bigint
  from public.sale_line_facts f
  where f.sold_at >= p_from and f.sold_at < p_to
  group by f.product_name
  order by sum(f.quantity) desc, sum(f.net_cents) desc
  limit greatest(coalesce(p_limit, 20), 1);
$$;

create or replace function public.report_by_category(p_from timestamptz, p_to timestamptz)
returns table (
  category_name text,
  quantity_sold numeric,
  revenue_cents bigint,
  profit_cents  bigint
)
language sql
stable
as $$
  select
    f.category_name,
    sum(f.quantity)::numeric,
    sum(f.net_cents)::bigint,
    sum(f.net_profit_cents)::bigint
  from public.sale_line_facts f
  where f.sold_at >= p_from and f.sold_at < p_to
  group by f.category_name
  order by sum(f.net_cents) desc;
$$;


-- ==========================================================================
-- 20260825090800_report_series.sql
-- ==========================================================================
-- ---------------------------------------------------------------------------
-- report_time_series: the trend behind the chart, and the row-per-period grouping the Excel
-- export uses for its daily, weekly and monthly views.
--
-- Buckets are cut in the shop local time zone, not UTC. Without that, an evening sale in
-- Beirut lands in the following day and the daily totals quietly disagree with the till.
--
-- Empty periods come back as explicit zeroes so a quiet Sunday is a visible gap in the chart
-- rather than a missing point the line skips over.
-- ---------------------------------------------------------------------------
create or replace function public.report_time_series(
  p_from     timestamptz,
  p_to       timestamptz,
  p_bucket   text default 'daily',
  p_timezone text default 'UTC'
)
returns table (
  bucket_start      timestamptz,
  sales_cents       bigint,
  profit_cents      bigint,
  transaction_count bigint,
  items_sold        numeric
)
language plpgsql
stable
as $$
declare
  v_unit text;
  v_step interval;
begin
  if p_bucket not in ('daily', 'weekly', 'monthly') then
    raise exception 'Unknown report bucket %', p_bucket using errcode = '22023';
  end if;

  v_unit := case p_bucket when 'weekly' then 'week' when 'monthly' then 'month' else 'day' end;
  v_step := case v_unit when 'week' then interval '1 week'
                        when 'month' then interval '1 month'
                        else interval '1 day' end;

  return query
  with periods as (
    select generate_series(
             date_trunc(v_unit, (p_from at time zone p_timezone)),
             date_trunc(v_unit, ((p_to - interval '1 microsecond') at time zone p_timezone)),
             v_step
           ) as bucket
  ),
  totals as (
    select date_trunc(v_unit, (s.sold_at at time zone p_timezone)) as bucket,
           sum(s.total_cents)::bigint  as sales,
           sum(s.profit_cents)::bigint as profit,
           count(*)::bigint            as txns,
           sum(s.item_count)::numeric  as items
    from public.sales s
    where s.sold_at >= p_from and s.sold_at < p_to
    group by 1
  )
  select (periods.bucket at time zone p_timezone)::timestamptz,
         coalesce(totals.sales, 0)::bigint,
         coalesce(totals.profit, 0)::bigint,
         coalesce(totals.txns, 0)::bigint,
         coalesce(totals.items, 0)::numeric
  from periods
  left join totals on totals.bucket = periods.bucket
  order by periods.bucket;
end;
$$;

-- The restocking list.
create or replace function public.report_low_stock()
returns table (
  product_id    uuid,
  product_name  text,
  barcode       text,
  category_name text,
  stock         numeric,
  threshold     numeric,
  unit          text
)
language sql
stable
as $$
  select p.id,
         p.name,
         p.barcode,
         coalesce(c.name, 'Uncategorised'),
         p.quantity_in_stock,
         p.low_stock_threshold,
         p.unit
  from public.products p
  left join public.categories c on c.id = p.category_id
  where p.is_active
    and p.quantity_in_stock <= p.low_stock_threshold
  order by (p.quantity_in_stock <= 0) desc, p.quantity_in_stock asc, p.name asc;
$$;


-- ==========================================================================
-- 20260825090900_grants.sql
-- ==========================================================================
-- ---------------------------------------------------------------------------
-- Nothing in this system is reachable without a session. Reporting functions run as the
-- caller, so row level security still applies inside them.
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.report_summary(timestamptz, timestamptz)',
    'public.report_top_products(timestamptz, timestamptz, integer)',
    'public.report_by_category(timestamptz, timestamptz)',
    'public.report_time_series(timestamptz, timestamptz, text, text)',
    'public.report_low_stock()'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;


-- ==========================================================================
-- 20260825091000_seed_categories.sql
-- ==========================================================================
-- A starting set of shelves so Sell mode is usable the moment the first product is added.
-- Renaming or deleting any of these from the app is expected.
insert into public.categories (name, color, sort_order) values
  ('Drinks',      '#0ea5e9', 10),
  ('Snacks',      '#f59e0b', 20),
  ('Groceries',   '#22c55e', 30),
  ('Dairy',       '#60a5fa', 40),
  ('Bakery',      '#d97706', 50),
  ('Household',   '#8b5cf6', 60),
  ('Personal Care','#ec4899', 70),
  ('Tobacco',     '#78716c', 80),
  ('Other',       '#64748b', 90)
on conflict do nothing;


-- ==========================================================================
-- 20260825091100_table_grants.sql
-- ==========================================================================
-- ---------------------------------------------------------------------------
-- Table privileges.
--
-- Row level security decides *which rows* a role may see. It has nothing to say about
-- whether that role may touch the table in the first place: that is an ordinary GRANT, and
-- without one Postgres refuses with "permission denied for table" before any policy is
-- consulted.
--
-- Supabase projects have historically handed these out by default, so it is easy to write a
-- schema that works in one project and fails in another. Granting them here explicitly makes
-- the schema self-contained and means it behaves the same wherever it is applied.
--
-- The grants deliberately mirror the policies exactly, so the two cannot drift apart:
-- anything the policies forbid is not granted either.
--
-- Each one is preceded by a revoke, because Supabase hands new tables a blanket GRANT ALL to
-- authenticated. Granting on top of that changes nothing: the role keeps TRUNCATE, and
-- TRUNCATE is not filtered by row level security the way select, insert, update and delete
-- are. A policy saying "sales are read-only" is no obstacle to emptying the table outright.
-- Revoking first makes the end state exactly what is written here, whatever the project
-- handed out beforehand.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;

revoke all on public.app_settings    from authenticated;
revoke all on public.categories      from authenticated;
revoke all on public.products        from authenticated;
revoke all on public.sales           from authenticated;
revoke all on public.sale_items      from authenticated;
revoke all on public.stock_movements from authenticated;
revoke all on public.sale_line_facts from authenticated;

-- Settings: the shop reads them everywhere and edits the rate.
grant select, update on public.app_settings to authenticated;

-- Categories and products are ordinary records the shop maintains.
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.products   to authenticated;

-- Money is read-only from the client. Sales are written only by checkout_sale, and the
-- stock ledger only by checkout_sale and adjust_stock, both of which run as the owner.
grant select on public.sales           to authenticated;
grant select on public.sale_items      to authenticated;
grant select on public.stock_movements to authenticated;
grant select on public.sale_line_facts to authenticated;

-- ---------------------------------------------------------------------------
-- And nothing at all for anonymous callers.
--
-- The anon key ships inside the app bundle and inside the APK, so it is public by
-- definition. It must be worthless without a session. This is belt and braces over the
-- policies, which already grant anon nothing: a future table added without a policy would
-- still be unreachable.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;


-- ==========================================================================
-- 20260828090000_cash_ledger.sql
-- ==========================================================================
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


-- ==========================================================================
-- 20260828090100_checkout_cash.sql
-- ==========================================================================
-- ---------------------------------------------------------------------------
-- checkout_sale, now also putting the takings in the cash box.
--
-- Identical to before except for the one insert at the end. It stays inside the same
-- transaction as the sale, so the books and the cash box can never disagree: if the sale is
-- rolled back for want of stock, the money never went in either.
-- ---------------------------------------------------------------------------
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

  for v_line in
    select (elem ->> 'product_id')::uuid as product_id,
           sum((elem ->> 'quantity')::numeric) as quantity
    from jsonb_array_elements(p_items) as elem
    group by 1
    order by 1
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

    v_line_total := round(v_product.sale_price_cents * v_line.quantity);
    v_line_cost  := round(v_product.cost_price_cents * v_line.quantity);

    insert into public.sale_items (
      sale_id, product_id, product_name, barcode, category_name, unit,
      unit_price_cents, unit_cost_cents, quantity,
      line_total_cents, line_cost_cents, line_profit_cents
    ) values (
      v_sale_id, v_product.id, v_product.name, v_product.barcode, v_product.category_name,
      v_product.unit, v_product.sale_price_cents, v_product.cost_price_cents, v_line.quantity,
      v_line_total, v_line_cost, v_line_total - v_line_cost
    );

    update public.products
       set quantity_in_stock = quantity_in_stock - v_line.quantity
     where id = v_product.id;

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

  -- The takings go into the cash box, in the same transaction as the sale itself.
  if v_total > 0 then
    insert into public.cash_movements (kind, amount_cents, sale_id, note, created_by)
    values ('sale', v_total, v_sale_id, null, auth.uid());
  end if;

  return v_sale_id;
end;
$$;

revoke all on function public.checkout_sale(jsonb, text, numeric, text, text) from public, anon;
grant execute on function public.checkout_sale(jsonb, text, numeric, text, text) to authenticated;


-- ==========================================================================
-- 20260828090200_restock_cost.sql
-- ==========================================================================
-- ---------------------------------------------------------------------------
-- adjust_stock, now able to say what a delivery cost and who paid for it.
--
-- Two ways to fund one:
--
--   budget   the shop pays. One entry out of the cash box, and the balance drops.
--   outside  the owner pays from their own pocket. Two entries: the money coming in as an
--            investment, and the same amount going straight out to the supplier. The balance
--            is unchanged, which is the truth of it, and both halves stay visible so the
--            total put in from outside can be told apart from the takings.
--
-- Only a delivery costs money. Correcting a miscount moves the count without any cash
-- changing hands, so it never touches the ledger.
-- ---------------------------------------------------------------------------
create or replace function public.adjust_stock(
  p_product_id uuid,
  p_delta      numeric,
  p_reason     text default 'restock',
  p_note       text default null,
  p_cost_cents bigint default null,
  p_funding    text default 'budget'
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_new     numeric;
  v_cost    bigint;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to change stock' using errcode = '42501';
  end if;

  if p_reason not in ('restock', 'adjustment', 'initial') then
    raise exception 'Unknown stock reason %', p_reason using errcode = '22023';
  end if;

  if p_funding not in ('budget', 'outside') then
    raise exception 'Unknown funding source %', p_funding using errcode = '22023';
  end if;

  if p_delta is null or p_delta = 0 then
    raise exception 'Stock change must be a non-zero amount' using errcode = '22023';
  end if;

  select * into v_product from public.products where id = p_product_id for update;

  if not found then
    raise exception 'That product no longer exists' using errcode = '23503';
  end if;

  v_new := v_product.quantity_in_stock + p_delta;

  if v_new < 0 then
    raise exception 'That would leave "%" at % %, below zero',
      v_product.name, v_new, v_product.unit using errcode = 'BS001';
  end if;

  update public.products set quantity_in_stock = v_new where id = p_product_id;

  insert into public.stock_movements (product_id, delta, reason, note, created_by)
  values (p_product_id, p_delta, p_reason, nullif(btrim(coalesce(p_note, '')), ''), auth.uid());

  -- Left unsaid, a delivery is priced at what the article costs. Passing a figure overrides
  -- it, because a supplier's price on the day is what actually left the till.
  if p_reason = 'restock' and p_delta > 0 then
    v_cost := coalesce(p_cost_cents, round(v_product.cost_price_cents * p_delta));

    if v_cost < 0 then
      raise exception 'A delivery cannot cost less than nothing' using errcode = '22023';
    end if;

    if v_cost > 0 then
      if p_funding = 'outside' then
        insert into public.cash_movements
          (kind, amount_cents, product_id, product_name, note, created_by)
        values ('investment', v_cost, p_product_id, v_product.name,
                nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
      end if;

      insert into public.cash_movements
        (kind, amount_cents, product_id, product_name, note, created_by)
      values ('restock', -v_cost, p_product_id, v_product.name,
              nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
    end if;
  end if;

  return v_new;
end;
$$;

-- The four argument form is gone; anything still calling it would silently skip the cost.
drop function if exists public.adjust_stock(uuid, numeric, text, text);

revoke all on function public.adjust_stock(uuid, numeric, text, text, bigint, text) from public, anon;
grant execute on function public.adjust_stock(uuid, numeric, text, text, bigint, text) to authenticated;


-- ==========================================================================
-- 20260828090300_budget_reports.sql
-- ==========================================================================
-- ---------------------------------------------------------------------------
-- What is in the cash box, and how it got there.
-- ---------------------------------------------------------------------------
create or replace function public.report_budget()
returns table (
  balance_cents        bigint,
  from_sales_cents     bigint,
  spent_restock_cents  bigint,
  invested_cents       bigint,
  entry_count          bigint
)
language sql
stable
as $$
  select
    coalesce(sum(amount_cents), 0)::bigint,
    coalesce(sum(amount_cents) filter (where kind = 'sale'), 0)::bigint,
    -- Stored negative; reported as the positive amount that was spent.
    coalesce(-sum(amount_cents) filter (where kind = 'restock'), 0)::bigint,
    coalesce(sum(amount_cents) filter (where kind = 'investment'), 0)::bigint,
    count(*)::bigint
  from public.cash_movements;
$$;

-- The ledger itself, newest first, so the balance can always be traced to its causes.
create or replace function public.list_cash_movements(p_limit integer default 100)
returns table (
  id           uuid,
  kind         text,
  amount_cents bigint,
  product_name text,
  note         text,
  created_at   timestamptz
)
language sql
stable
as $$
  select m.id, m.kind, m.amount_cents, m.product_name, m.note, m.created_at
  from public.cash_movements m
  order by m.created_at desc, m.id desc
  limit greatest(coalesce(p_limit, 100), 1);
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.report_budget()',
    'public.list_cash_movements(integer)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;


-- ==========================================================================
-- 20260828090400_reset_shop.sql
-- ==========================================================================
-- ---------------------------------------------------------------------------
-- reset_shop: empties the whole thing.
--
-- Deliberately blunt and deliberately awkward to call. It takes the word RESET and refuses
-- anything else, so it cannot be reached by a stray tap or a mistyped request: whoever runs
-- it has to have meant it.
--
-- Everything goes. Sales, the stock ledger, the cash box, every article and every category.
-- What survives is the settings row, because the exchange rate is a fact about the country
-- rather than a fact about the shop, and losing it would just be an extra thing to type back in.
-- ---------------------------------------------------------------------------
create or replace function public.reset_shop(p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counts jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to reset the shop' using errcode = '42501';
  end if;

  if p_confirm is distinct from 'RESET' then
    raise exception 'Reset needs the word RESET to confirm it' using errcode = '22023';
  end if;

  -- Counted before the delete, so the app can say exactly what it removed.
  select jsonb_build_object(
    'sales',      (select count(*) from public.sales),
    'sale_items', (select count(*) from public.sale_items),
    'stock',      (select count(*) from public.stock_movements),
    'cash',       (select count(*) from public.cash_movements),
    'products',   (select count(*) from public.products),
    'categories', (select count(*) from public.categories)
  ) into v_counts;

  -- Order matters only for stock_movements, whose sale_id is ON DELETE SET NULL rather than
  -- cascade; the rest fall away with their parents.
  delete from public.cash_movements;
  delete from public.stock_movements;
  delete from public.sale_items;
  delete from public.sales;
  delete from public.products;
  delete from public.categories;

  return v_counts;
end;
$$;

revoke all on function public.reset_shop(text) from public, anon;
grant execute on function public.reset_shop(text) to authenticated;
