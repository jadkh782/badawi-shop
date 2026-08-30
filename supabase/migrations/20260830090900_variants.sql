-- ---------------------------------------------------------------------------
-- Articles that come in sizes and flavours.
--
-- Tobacco is not one article. It is a brand, a weight and a taste, and the shop stocks
-- perhaps a dozen combinations of the three. Each one is genuinely its own article: its own
-- barcode, its own price, its own count on the shelf. What they share is a name.
--
-- Typing that name out by hand is where it goes wrong. "Al Fakher 250g Double Apple" and
-- "Al fakher 250 G double apple" are two rows in the catalogue and one thing in the shop,
-- and once they have both been sold a few times no report can put them back together.
--
-- So the parts are kept apart and the name is assembled from them. The size comes off a list
-- of buttons, the taste is typed once, and the article ends up named consistently because
-- nobody had the chance to name it any other way.
--
-- Which categories work this way is data, not code. A category with no sizes behaves exactly
-- as it always did, so nothing changes for Drinks or Bakery. Turning it on for another shelf
-- is one UPDATE, without a release.
-- ---------------------------------------------------------------------------

-- The sizes offered for articles on this shelf. Empty or null means the shelf has none, and
-- the form stays exactly as it is everywhere else.
alter table public.categories
  add column if not exists variant_sizes text[];

-- What the free-text part is called on this shelf. Tobacco calls it a taste; another shelf
-- might call it a colour or a scent, and the form asks using the shop's own word for it.
alter table public.categories
  add column if not exists variant_trait_label text;

-- The parts an article's name was assembled from, kept so the form can take it apart again
-- and put it back together when one of them is edited.
alter table public.products
  add column if not exists variant_size text;
alter table public.products
  add column if not exists variant_trait text;

-- ---------------------------------------------------------------------------
-- Tobacco, set up the way the shop actually sells it.
--
-- Matched on the name rather than an id, because the seeded categories are the shop's to
-- rename or delete. Guarded so a shop that has already chosen its own sizes keeps them.
-- ---------------------------------------------------------------------------
update public.categories
   set variant_sizes       = array['50g', '250g', '1kg'],
       variant_trait_label = 'Taste'
 where lower(name) = 'tobacco'
   and variant_sizes is null;

-- ---------------------------------------------------------------------------
-- create_product, carrying the parts through.
--
-- The assembled name still arrives in p_name, because everything downstream — the till, the
-- reports, the search box — reads one name and should carry on doing so. These two are
-- recorded beside it so the article can be edited as parts rather than as a string.
-- ---------------------------------------------------------------------------
drop function if exists public.create_product(
  text, text, uuid, integer, integer, numeric, numeric, text, text, text
);

create or replace function public.create_product(
  p_barcode             text,
  p_name                text,
  p_category_id         uuid,
  p_cost_price_cents    integer,
  p_sale_price_cents    integer,
  p_quantity            numeric,
  p_low_stock_threshold numeric,
  p_unit                text,
  p_notes               text,
  p_funding             text default 'budget',
  p_variant_size        text default null,
  p_variant_trait       text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to add an article' using errcode = '42501';
  end if;

  if p_funding not in ('budget', 'outside') then
    raise exception 'Unknown funding source %', p_funding using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'Give the article a name' using errcode = '22023';
  end if;

  if coalesce(p_quantity, 0) < 0 then
    raise exception 'Opening stock cannot be less than nothing' using errcode = '22023';
  end if;

  -- The shelf starts empty and is filled by adjust_stock below, so the opening stock leaves
  -- the same ledger trail every later delivery does.
  insert into public.products (
    barcode, name, category_id, cost_price_cents, sale_price_cents,
    quantity_in_stock, low_stock_threshold, unit, notes, last_cost_price_cents,
    variant_size, variant_trait
  ) values (
    nullif(btrim(coalesce(p_barcode, '')), ''),
    btrim(p_name),
    p_category_id,
    greatest(coalesce(p_cost_price_cents, 0), 0),
    greatest(coalesce(p_sale_price_cents, 0), 0),
    0,
    greatest(coalesce(p_low_stock_threshold, 0), 0),
    coalesce(nullif(btrim(coalesce(p_unit, '')), ''), 'piece'),
    nullif(btrim(coalesce(p_notes, '')), ''),
    case when coalesce(p_quantity, 0) > 0 then greatest(coalesce(p_cost_price_cents, 0), 0) end,
    nullif(btrim(coalesce(p_variant_size, '')), ''),
    nullif(btrim(coalesce(p_variant_trait, '')), '')
  )
  returning id into v_id;

  -- Where the article started, so the price trail has a beginning rather than appearing to
  -- spring into existence at the first delivery.
  insert into public.product_price_history (
    product_id, source, quantity, stock_before, stock_after, purchase_cost_cents,
    old_cost_cents, new_cost_cents, old_sale_price_cents, new_sale_price_cents,
    note, created_by
  ) values (
    v_id, 'opening', coalesce(p_quantity, 0), 0, coalesce(p_quantity, 0),
    greatest(coalesce(p_cost_price_cents, 0), 0),
    greatest(coalesce(p_cost_price_cents, 0), 0), greatest(coalesce(p_cost_price_cents, 0), 0),
    greatest(coalesce(p_sale_price_cents, 0), 0), greatest(coalesce(p_sale_price_cents, 0), 0),
    'Article added', auth.uid()
  );

  if coalesce(p_quantity, 0) > 0 then
    perform public.adjust_stock(
      v_id,
      p_quantity,
      'initial',
      'Opening stock',
      greatest(coalesce(p_cost_price_cents, 0), 0),
      p_funding,
      null
    );
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_product(
  text, text, uuid, integer, integer, numeric, numeric, text, text, text, text, text
) from public, anon;
grant execute on function public.create_product(
  text, text, uuid, integer, integer, numeric, numeric, text, text, text, text, text
) to authenticated;
