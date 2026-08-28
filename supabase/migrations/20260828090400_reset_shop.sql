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
