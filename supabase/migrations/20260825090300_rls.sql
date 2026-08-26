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
