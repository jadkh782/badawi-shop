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
