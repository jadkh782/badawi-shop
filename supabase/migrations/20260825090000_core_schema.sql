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
