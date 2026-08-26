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
