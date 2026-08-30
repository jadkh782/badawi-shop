-- ---------------------------------------------------------------------------
-- A reset should leave a fresh shop, not an empty one.
--
-- reset_shop emptied the categories along with everything else, and nothing put them back.
-- The starting shelves are seeded by a migration, and a migration only runs when the schema
-- is applied, so after a reset the shop had no shelves at all: Sell mode had nothing to
-- browse, and Tobacco took its sizes with it when it went.
--
-- That is not what resetting means. It means starting again from empty, and a brand new shop
-- is not empty of shelves — it opens with the same nine the schema gives it. So the starting
-- set moves out of the seed migration and into a function, and the reset calls it.
--
-- Keeping it in one place also fixes the quieter half of the problem. The shelves and their
-- sizes were described in two migrations that had to agree with each other by matching on a
-- name; now they are described once, in the function that creates them.
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
  /*
    Idempotent by way of the case-insensitive unique index on the name: a shelf the shop has
    already got, or has renamed and kept, is left exactly as it is. Only what is genuinely
    missing gets added, so this is safe to call on a shop mid-life as well as on an empty one.
  */
  insert into public.categories (name, color, sort_order, variant_sizes, variant_trait_label)
  values
    ('Drinks',        '#0ea5e9', 10, null, null),
    ('Snacks',        '#f59e0b', 20, null, null),
    ('Groceries',     '#22c55e', 30, null, null),
    ('Dairy',         '#60a5fa', 40, null, null),
    ('Bakery',        '#d97706', 50, null, null),
    ('Household',     '#8b5cf6', 60, null, null),
    ('Personal Care', '#ec4899', 70, null, null),
    -- Sold by weight and taste, so articles here are named from their parts.
    ('Tobacco',       '#78716c', 80, array['50g', '250g', '1kg'], 'Taste'),
    ('Other',         '#64748b', 90, null, null)
  on conflict do nothing;

  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

-- Any shop already carrying a Tobacco shelf without its sizes gets them, which covers a
-- shelf recreated by hand after a reset.
update public.categories
   set variant_sizes       = array['50g', '250g', '1kg'],
       variant_trait_label = 'Taste'
 where lower(name) = 'tobacco'
   and variant_sizes is null;

-- And a shop that has just been reset gets its shelves back.
select public.seed_default_categories();

-- ---------------------------------------------------------------------------
-- reset_shop, ending on a shop that can be used rather than one that has to be
-- rebuilt by hand before the first sale.
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

  select jsonb_build_object(
    'sales',      (select count(*) from public.sales),
    'sale_items', (select count(*) from public.sale_items),
    'stock',      (select count(*) from public.stock_movements),
    'cash',       (select count(*) from public.cash_movements),
    'products',   (select count(*) from public.products),
    'categories', (select count(*) from public.categories),
    'batches',    (select count(*) from public.stock_batches),
    'prices',     (select count(*) from public.product_price_history),
    'refunds',    (select count(*) from public.sale_refunds)
  ) into v_counts;

  /*
    Every one of these carries `where true`, which looks redundant and is not.

    Supabase preloads the safeupdate extension, which refuses any DELETE or UPDATE without a
    WHERE clause so that a mistyped statement cannot empty a table. A plain Postgres does not,
    which is how this shipped passing every local test and then failed in the shop with
    "DELETE requires a WHERE clause". The guard is worth keeping; this really does mean to
    empty the table, so it says so out loud rather than by omission.

    Children before parents throughout, so nothing depends on which foreign keys happen to
    cascade and which merely null out.
  */
  delete from public.sale_refund_items     where true;
  delete from public.sale_refunds          where true;
  delete from public.sale_item_batches     where true;
  delete from public.cash_movements        where true;
  delete from public.stock_movements       where true;
  delete from public.sale_items            where true;
  delete from public.sales                 where true;
  delete from public.product_price_history where true;
  delete from public.stock_batches         where true;
  delete from public.products              where true;
  delete from public.categories            where true;

  -- The shelves come back. A shop with nothing to sell is the point of a reset; a shop with
  -- nowhere to put what it sells is just broken.
  perform public.seed_default_categories();

  return v_counts;
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.seed_default_categories()',
    'public.reset_shop(text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
