-- ---------------------------------------------------------------------------
-- The new tables, locked down the same way the old ones are.
--
-- Every one of them is money or the record of it, and every one is written only by a
-- SECURITY DEFINER function. So the client may read them and nothing more: a device can show
-- the price history but cannot invent one, and can show what a batch cost but cannot decide
-- it. The grants mirror the policies exactly, and each is preceded by a revoke because
-- Supabase hands new tables a blanket GRANT ALL that would otherwise leave TRUNCATE behind.
-- ---------------------------------------------------------------------------

alter table public.stock_batches         enable row level security;
alter table public.product_price_history enable row level security;
alter table public.sale_item_batches     enable row level security;
alter table public.sale_refunds          enable row level security;
alter table public.sale_refund_items     enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'stock_batches', 'product_price_history', 'sale_item_batches',
    'sale_refunds', 'sale_refund_items'
  ]
  loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format(
      'create policy %I_read on public.%I for select to authenticated using (true)', t, t
    );
    execute format('revoke all on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- reset_shop, now emptying the tables that did not exist when it was written.
--
-- Most of them would fall away with their parents anyway, but naming them keeps the counts
-- honest: the screen tells the shop exactly what it removed, and a table missing from this
-- list is a table that silently reports zero.
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
  delete from public.sale_refund_items    where true;
  delete from public.sale_refunds         where true;
  delete from public.sale_item_batches    where true;
  delete from public.cash_movements       where true;
  delete from public.stock_movements      where true;
  delete from public.sale_items           where true;
  delete from public.sales                where true;
  delete from public.product_price_history where true;
  delete from public.stock_batches        where true;
  delete from public.products             where true;
  delete from public.categories           where true;

  return v_counts;
end;
$$;

revoke all on function public.reset_shop(text) from public, anon;
grant execute on function public.reset_shop(text) to authenticated;

-- Anonymous callers keep getting nothing, including from everything added above.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
