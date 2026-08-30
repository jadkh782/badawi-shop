-- ---------------------------------------------------------------------------
-- Three parts, in the order the shop thinks in.
--
-- Tobacco is a brand, then a taste, then a weight. That is the order it is asked for over
-- the counter — "Fakher, double apple, the big one" — and so it is the order the article is
-- entered in and the order it is found in.
--
-- Until now the brand was only the leading words of the assembled name, recovered by
-- chopping the other parts back off. That works right up until someone edits a name by hand,
-- and then the article quietly stops grouping with its own family. So the brand becomes a
-- column of its own. All three parts are stored, the name is assembled from them for
-- everything that reads one name, and grouping never depends on parsing a string.
--
-- The assembled order changes with it: brand, taste, weight. "Al Fakher Double Apple 250g"
-- rather than "Al Fakher 250g Double Apple".
-- ---------------------------------------------------------------------------

-- What this shelf calls the leading part. Tobacco calls it a brand.
alter table public.categories
  add column if not exists variant_base_label text;

alter table public.products
  add column if not exists variant_base text;

-- ---------------------------------------------------------------------------
-- Recover the brand for articles entered before it had a column.
--
-- The parts were appended verbatim when the name was built, so they come off verbatim. A
-- name that does not end in its own parts has been edited by hand since, and is kept whole
-- rather than guessed at and mangled.
-- ---------------------------------------------------------------------------
update public.products
   set variant_base = coalesce(
     nullif(btrim(
       case
         when concat_ws(' ', variant_size, variant_trait) <> ''
          and name like ('%' || concat_ws(' ', variant_size, variant_trait))
           then left(name, length(name) - length(concat_ws(' ', variant_size, variant_trait)))
         else name
       end
     ), ''),
     name
   )
 where variant_base is null
   and (variant_size is not null or variant_trait is not null);

-- The drill-down walks brand, then taste, then weight, so that is the order it is indexed in.
create index if not exists products_variant_idx
  on public.products (category_id, variant_base, variant_trait)
  where is_active and variant_base is not null;

-- ---------------------------------------------------------------------------
-- The starting shelves, with Tobacco's full vocabulary.
--
-- Replacing the whole function rather than patching the row, so that a reset and a fresh
-- install describe the shelf in exactly one place.
-- ---------------------------------------------------------------------------
create or replace function public.seed_default_categories()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_added integer;
begin
  insert into public.categories
    (name, color, sort_order, variant_sizes, variant_trait_label, variant_base_label)
  values
    ('Drinks',        '#0ea5e9', 10, null, null, null),
    ('Snacks',        '#f59e0b', 20, null, null, null),
    ('Groceries',     '#22c55e', 30, null, null, null),
    ('Dairy',         '#60a5fa', 40, null, null, null),
    ('Bakery',        '#d97706', 50, null, null, null),
    ('Household',     '#8b5cf6', 60, null, null, null),
    ('Personal Care', '#ec4899', 70, null, null, null),
    -- A brand, a taste and a weight, asked for in that order.
    ('Tobacco',       '#78716c', 80, array['50g', '250g', '1kg'], 'Taste', 'Brand'),
    ('Other',         '#64748b', 90, null, null, null)
  on conflict do nothing;

  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

-- A Tobacco shelf that already exists gets the vocabulary it is missing, which covers both a
-- shop upgrading and a shelf recreated by hand after a reset.
update public.categories
   set variant_sizes       = coalesce(variant_sizes, array['50g', '250g', '1kg']),
       variant_trait_label = coalesce(variant_trait_label, 'Taste'),
       variant_base_label  = coalesce(variant_base_label, 'Brand')
 where lower(name) = 'tobacco';

-- Any other shelf that comes in sizes gets a sensible word for its leading part.
update public.categories
   set variant_base_label = 'Brand'
 where variant_sizes is not null
   and cardinality(variant_sizes) > 0
   and variant_base_label is null;

select public.seed_default_categories();

-- ---------------------------------------------------------------------------
-- create_product, carrying all three parts.
-- ---------------------------------------------------------------------------
drop function if exists public.create_product(
  text, text, uuid, integer, integer, numeric, numeric, text, text, text, text, text
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
  p_variant_trait       text default null,
  p_variant_base        text default null
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
    variant_size, variant_trait, variant_base
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
    nullif(btrim(coalesce(p_variant_trait, '')), ''),
    -- Derived when a caller supplies parts but no brand, so the column is never half
    -- filled. Exact rather than clever: the parts come off the end verbatim or not at all.
    coalesce(
      nullif(btrim(coalesce(p_variant_base, '')), ''),
      case
        when concat_ws(' ', nullif(btrim(coalesce(p_variant_trait, '')), ''),
                            nullif(btrim(coalesce(p_variant_size, '')), '')) <> ''
         and btrim(p_name) like ('%' || concat_ws(' ',
                nullif(btrim(coalesce(p_variant_trait, '')), ''),
                nullif(btrim(coalesce(p_variant_size, '')), '')))
        then nullif(btrim(left(btrim(p_name),
               length(btrim(p_name)) - length(concat_ws(' ',
                 nullif(btrim(coalesce(p_variant_trait, '')), ''),
                 nullif(btrim(coalesce(p_variant_size, '')), ''))))), '')
      end
    )
  )
  returning id into v_id;

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
      v_id, p_quantity, 'initial', 'Opening stock',
      greatest(coalesce(p_cost_price_cents, 0), 0), p_funding, null
    );
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_product(
  text, text, uuid, integer, integer, numeric, numeric, text, text, text, text, text, text
) from public, anon;
grant execute on function public.create_product(
  text, text, uuid, integer, integer, numeric, numeric, text, text, text, text, text, text
) to authenticated;
