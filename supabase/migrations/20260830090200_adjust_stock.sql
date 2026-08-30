-- ---------------------------------------------------------------------------
-- adjust_stock, rewritten around the price the supplier actually charged.
--
-- Three things changed.
--
-- First, a delivery is now priced per unit rather than as a lump sum. "Twelve arrived at
-- $1.75 each" is what the invoice says and what the shop knows; the total is arithmetic and
-- the app can do that itself. It also makes the interesting question askable: is $1.75 what
-- this cost last time?
--
-- Second, a delivery lands as a batch. In average mode the batches are folded together
-- immediately and the article carries the blend. In batch mode they stay apart until the
-- older stock sells out. Either way the article's cost_price_cents ends up as the weighted
-- average of what is on the shelf, so every valuation and margin figure in the system keeps
-- meaning the same thing.
--
-- Third, correcting a miscount now moves money, which it always should have. Stock that is
-- on the shelf but not on the books was paid for out of someone's pocket, so the balance
-- comes down by what it is worth. Stock that is on the books but not on the shelf was never
-- really bought, so the balance goes back up. Neither is a purchase, so both are recorded as
-- corrections rather than hidden inside the delivery figures.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The article's cost, restated from the batches behind it.
--
-- Called after anything that changes what is on the shelf. Leaves the cost alone when the
-- shelf is empty: the last price paid is a better guess for the next delivery than zero is.
-- ---------------------------------------------------------------------------
create or replace function public.sync_cost_from_batches(p_product_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty  numeric;
  v_cost numeric;
  v_unit integer;
begin
  select coalesce(sum(quantity_remaining), 0),
         coalesce(sum(quantity_remaining * unit_cost_cents), 0)
    into v_qty, v_cost
    from public.stock_batches
   where product_id = p_product_id
     and quantity_remaining > 0;

  if v_qty <= 0 then
    return null;
  end if;

  v_unit := round(v_cost / v_qty);
  update public.products set cost_price_cents = v_unit where id = p_product_id;
  return v_unit;
end;
$$;

drop function if exists public.adjust_stock(uuid, numeric, text, text);
drop function if exists public.adjust_stock(uuid, numeric, text, text, bigint, text);
drop function if exists public.adjust_stock(uuid, numeric, text, text, integer, text, integer);

create or replace function public.adjust_stock(
  p_product_id           uuid,
  p_delta                numeric,
  p_reason               text    default 'restock',
  p_note                 text    default null,
  -- What one unit of this delivery cost. Left null, the article's current cost stands, which
  -- is the right answer whenever the supplier charged what they usually do.
  p_unit_cost_cents      integer default null,
  p_funding              text    default 'budget',
  -- A new shelf price to go with the new cost. Null leaves the price where it is.
  p_new_sale_price_cents integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product   public.products%rowtype;
  v_settings  public.app_settings%rowtype;
  v_new       numeric;
  v_unit      integer;
  v_total     bigint;
  v_kind      text;
  v_cost_now  integer;
  v_alloc     jsonb;
  v_taken     numeric;
  v_taken_val numeric;
  v_sale      integer;
  v_prev_cost integer;
  v_prev_sale integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to change stock' using errcode = '42501';
  end if;

  if p_reason not in ('restock', 'adjustment', 'initial') then
    raise exception 'Unknown stock reason %', p_reason using errcode = '22023';
  end if;

  if p_funding not in ('budget', 'outside') then
    raise exception 'Unknown funding source %', p_funding using errcode = '22023';
  end if;

  if p_delta is null or p_delta = 0 then
    raise exception 'Stock change must be a non-zero amount' using errcode = '22023';
  end if;

  if p_unit_cost_cents is not null and p_unit_cost_cents < 0 then
    raise exception 'A price cannot be less than nothing' using errcode = '22023';
  end if;

  if p_new_sale_price_cents is not null and p_new_sale_price_cents < 0 then
    raise exception 'A price cannot be less than nothing' using errcode = '22023';
  end if;

  select * into v_settings from public.app_settings where id = 1;
  select * into v_product from public.products where id = p_product_id for update;

  if not found then
    raise exception 'That product no longer exists' using errcode = '23503';
  end if;

  -- The batches are brought level with the shelf before anything moves, so every figure
  -- below is drawn from a complete picture rather than a partial one.
  perform public.reconcile_batches(p_product_id, v_product.quantity_in_stock);

  -- Held from before anything moves, so the caller can be told what changed rather than
  -- being handed the new figures and left to guess whether they are new.
  v_prev_cost := v_product.cost_price_cents;
  v_prev_sale := v_product.sale_price_cents;

  v_new := v_product.quantity_in_stock + p_delta;

  if v_new < 0 then
    raise exception 'That would leave "%" at % %, below zero',
      v_product.name, v_new, v_product.unit using errcode = 'BS001';
  end if;

  update public.products set quantity_in_stock = v_new where id = p_product_id;

  insert into public.stock_movements (product_id, delta, reason, note, created_by)
  values (p_product_id, p_delta, p_reason, nullif(btrim(coalesce(p_note, '')), ''), auth.uid());

  v_sale := v_product.sale_price_cents;

  -- ---------------------------------------------------------------------------
  -- A delivery, or the first stock of a new article. Both are a purchase.
  -- ---------------------------------------------------------------------------
  if p_reason in ('restock', 'initial') and p_delta > 0 then
    v_unit  := coalesce(p_unit_cost_cents, v_product.cost_price_cents);
    v_total := round(v_unit::numeric * p_delta);
    v_kind  := case when p_reason = 'initial' then 'opening' else 'restock' end;

    insert into public.stock_batches
      (product_id, unit_cost_cents, quantity_received, quantity_remaining, source, note, created_by)
    values (p_product_id, v_unit, p_delta, p_delta,
            case when p_reason = 'initial' then 'opening' else 'restock' end,
            nullif(btrim(coalesce(p_note, '')), ''), auth.uid());

    -- Average mode folds the shelf back down to one price straight away; batch mode leaves
    -- the new delivery standing beside what was already there.
    if v_settings.cost_method = 'average' then
      perform public.collapse_to_average(p_product_id);
    end if;

    v_cost_now := coalesce(public.sync_cost_from_batches(p_product_id), v_unit);

    update public.products
       set last_cost_price_cents = v_unit,
           sale_price_cents = coalesce(p_new_sale_price_cents, sale_price_cents)
     where id = p_product_id;

    v_sale := coalesce(p_new_sale_price_cents, v_product.sale_price_cents);

    -- Worth a history row only when something actually moved.
    if v_cost_now is distinct from v_product.cost_price_cents
       or v_sale is distinct from v_product.sale_price_cents
       or v_unit is distinct from v_product.cost_price_cents then
      insert into public.product_price_history (
        product_id, source, quantity, stock_before, stock_after, purchase_cost_cents,
        old_cost_cents, new_cost_cents, old_sale_price_cents, new_sale_price_cents,
        note, created_by
      ) values (
        p_product_id,
        case when p_reason = 'initial' then 'opening' else 'restock' end,
        p_delta, v_product.quantity_in_stock, v_new, v_unit,
        v_product.cost_price_cents, v_cost_now,
        v_product.sale_price_cents, v_sale,
        nullif(btrim(coalesce(p_note, '')), ''), auth.uid()
      );
    end if;

    if v_total > 0 then
      -- Paid from outside, the money comes in and goes straight back out, so the balance is
      -- unchanged and both halves stay visible.
      if p_funding = 'outside' then
        insert into public.cash_movements
          (kind, amount_cents, product_id, product_name, note, created_by)
        values ('investment', v_total, p_product_id, v_product.name,
                nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
      end if;

      insert into public.cash_movements
        (kind, amount_cents, product_id, product_name, note, created_by)
      values (v_kind, -v_total, p_product_id, v_product.name,
              nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
    end if;

  -- ---------------------------------------------------------------------------
  -- A correction. No goods changed hands, but the books were wrong about money.
  -- ---------------------------------------------------------------------------
  elsif p_reason = 'adjustment' then
    if p_delta > 0 then
      -- Found on the shelf. Valued at what the article costs, unless a price was given.
      v_unit := coalesce(p_unit_cost_cents, v_product.cost_price_cents);

      insert into public.stock_batches
        (product_id, unit_cost_cents, quantity_received, quantity_remaining, source, note, created_by)
      values (p_product_id, v_unit, p_delta, p_delta, 'correction',
              nullif(btrim(coalesce(p_note, '')), ''), auth.uid());

      if v_settings.cost_method = 'average' then
        perform public.collapse_to_average(p_product_id);
      end if;

      v_total := round(v_unit::numeric * p_delta);
    else
      -- Missing from the shelf. Valued at what those particular units cost, taken from the
      -- oldest batches, so the figure matches the stock that has actually gone.
      v_alloc := public.consume_batches(p_product_id, -p_delta);

      select coalesce(sum((elem ->> 'quantity')::numeric), 0),
             coalesce(sum((elem ->> 'quantity')::numeric
                          * (elem ->> 'unit_cost_cents')::numeric), 0)
        into v_taken, v_taken_val
        from jsonb_array_elements(v_alloc) as elem;

      v_total := -round(v_taken_val);
    end if;

    perform public.sync_cost_from_batches(p_product_id);

    if v_total <> 0 then
      insert into public.cash_movements
        (kind, amount_cents, product_id, product_name, note, created_by)
      values ('correction', -v_total, p_product_id, v_product.name,
              nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
    end if;

  -- ---------------------------------------------------------------------------
  -- A delivery entered as a negative, which is a return to the supplier. Stock leaves and
  -- the money comes back, priced at what those units cost.
  -- ---------------------------------------------------------------------------
  elsif p_delta < 0 then
    v_alloc := public.consume_batches(p_product_id, -p_delta);

    select coalesce(sum((elem ->> 'quantity')::numeric
                        * (elem ->> 'unit_cost_cents')::numeric), 0)
      into v_taken_val
      from jsonb_array_elements(v_alloc) as elem;

    perform public.sync_cost_from_batches(p_product_id);

    if v_taken_val > 0 then
      insert into public.cash_movements
        (kind, amount_cents, product_id, product_name, note, created_by)
      values ('correction', round(v_taken_val), p_product_id, v_product.name,
              nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
    end if;
  end if;

  select * into v_product from public.products where id = p_product_id;

  return jsonb_build_object(
    'stock',                v_new,
    'cost_price_cents',     v_product.cost_price_cents,
    'previous_cost_cents',  v_prev_cost,
    'sale_price_cents',     v_product.sale_price_cents,
    'previous_sale_cents',  v_prev_sale,
    'last_cost_cents',      v_product.last_cost_price_cents,
    'cost_changed',         (v_product.cost_price_cents is distinct from v_prev_cost),
    'sale_price_changed',   (v_product.sale_price_cents is distinct from v_prev_sale)
  );
end;
$$;

revoke all on function public.sync_cost_from_batches(uuid) from public, anon;
revoke all on function public.adjust_stock(uuid, numeric, text, text, integer, text, integer)
  from public, anon;
grant execute on function public.adjust_stock(uuid, numeric, text, text, integer, text, integer)
  to authenticated;
