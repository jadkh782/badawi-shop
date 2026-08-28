-- ---------------------------------------------------------------------------
-- adjust_stock, now able to say what a delivery cost and who paid for it.
--
-- Two ways to fund one:
--
--   budget   the shop pays. One entry out of the cash box, and the balance drops.
--   outside  the owner pays from their own pocket. Two entries: the money coming in as an
--            investment, and the same amount going straight out to the supplier. The balance
--            is unchanged, which is the truth of it, and both halves stay visible so the
--            total put in from outside can be told apart from the takings.
--
-- Only a delivery costs money. Correcting a miscount moves the count without any cash
-- changing hands, so it never touches the ledger.
-- ---------------------------------------------------------------------------
create or replace function public.adjust_stock(
  p_product_id uuid,
  p_delta      numeric,
  p_reason     text default 'restock',
  p_note       text default null,
  p_cost_cents bigint default null,
  p_funding    text default 'budget'
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_new     numeric;
  v_cost    bigint;
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

  -- Left unsaid, a delivery is priced at what the article costs. Passing a figure overrides
  -- it, because a supplier's price on the day is what actually left the till.
  if p_reason = 'restock' and p_delta > 0 then
    v_cost := coalesce(p_cost_cents, round(v_product.cost_price_cents * p_delta));

    if v_cost < 0 then
      raise exception 'A delivery cannot cost less than nothing' using errcode = '22023';
    end if;

    if v_cost > 0 then
      if p_funding = 'outside' then
        insert into public.cash_movements
          (kind, amount_cents, product_id, product_name, note, created_by)
        values ('investment', v_cost, p_product_id, v_product.name,
                nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
      end if;

      insert into public.cash_movements
        (kind, amount_cents, product_id, product_name, note, created_by)
      values ('restock', -v_cost, p_product_id, v_product.name,
              nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
    end if;
  end if;

  return v_new;
end;
$$;

-- The four argument form is gone; anything still calling it would silently skip the cost.
drop function if exists public.adjust_stock(uuid, numeric, text, text);

revoke all on function public.adjust_stock(uuid, numeric, text, text, bigint, text) from public, anon;
grant execute on function public.adjust_stock(uuid, numeric, text, text, bigint, text) to authenticated;
