-- ---------------------------------------------------------------------------
-- create_product: adding an article is a purchase, and the books should say so.
--
-- Until now the first stock of a new article went in as a plain column value. Nothing
-- recorded that the shop had just spent money on a box of something, so the balance carried
-- on as though the shelf had filled itself. Ten articles entered at $30 each is $300 that
-- left someone's pocket and appeared nowhere.
--
-- So it asks the same question the delivery sheet already asks: shop money, or your own.
-- Shop money takes it out of the balance. Your own money is recorded as put in from outside
-- and the balance is left where it was, which is the truth of it, and the two stay
-- distinguishable so "what have I sunk into this place" remains an answerable question.
--
-- The insert and the opening stock happen in one transaction, so an article can never exist
-- holding stock nobody paid for.
-- ---------------------------------------------------------------------------
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
  p_funding             text default 'budget'
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
    quantity_in_stock, low_stock_threshold, unit, notes, last_cost_price_cents
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
    case when coalesce(p_quantity, 0) > 0 then greatest(coalesce(p_cost_price_cents, 0), 0) end
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
  text, text, uuid, integer, integer, numeric, numeric, text, text, text
) from public, anon;
grant execute on function public.create_product(
  text, text, uuid, integer, integer, numeric, numeric, text, text, text
) to authenticated;
