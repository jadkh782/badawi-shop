-- ---------------------------------------------------------------------------
-- Removing an article gives back what its stock cost.
--
-- Taking an article out of the inventory was a one line update that flipped is_active and
-- said nothing else. An article holding twelve tins that cost $2 each simply stopped
-- existing, and $24 of stock left the shop without the cash box noticing. The shelves were
-- worth less and the balance was unchanged, which cannot both be true.
--
-- So removal now works like every other way stock leaves: the units come off the shelf,
-- priced at what those exact units cost rather than at today's average, and the money goes
-- back into the budget. It reads as its own kind in the ledger because "removed from
-- inventory" and "corrected a miscount" are different events even when the arithmetic
-- matches, and a balance nobody can explain is a balance nobody trusts.
--
-- The article itself is archived rather than deleted. Sale history keeps its own snapshots,
-- but an accidental delete would still lose the record of the thing.
-- ---------------------------------------------------------------------------

alter table public.cash_movements
  drop constraint if exists cash_movements_kind_check;
alter table public.cash_movements
  add constraint cash_movements_kind_check check (
    kind in ('sale', 'restock', 'opening', 'investment', 'correction',
             'void', 'refund', 'removal')
  );

alter table public.cash_movements
  drop constraint if exists cash_direction;
alter table public.cash_movements
  add constraint cash_direction check (
    (kind = 'sale'       and amount_cents >= 0) or
    (kind = 'investment' and amount_cents >= 0) or
    -- Stock leaving the inventory hands its money back, so this only ever comes in.
    (kind = 'removal'    and amount_cents >= 0) or
    (kind = 'restock'    and amount_cents <= 0) or
    (kind = 'opening'    and amount_cents <= 0) or
    (kind = 'void'       and amount_cents <= 0) or
    (kind = 'refund'     and amount_cents <= 0) or
    -- Found stock costs money, missing stock gives it back. Both are corrections.
    (kind = 'correction')
  );

-- ---------------------------------------------------------------------------
-- archive_product: take it off the shelves, and put the money back.
-- ---------------------------------------------------------------------------
create or replace function public.archive_product(
  p_product_id uuid,
  p_reason     text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_alloc   jsonb;
  v_value   numeric := 0;
  v_units   numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to remove an article' using errcode = '42501';
  end if;

  select * into v_product from public.products where id = p_product_id for update;

  if not found then
    raise exception 'That product no longer exists' using errcode = '23503';
  end if;

  -- Already gone. Saying so quietly beats refusing a button someone tapped twice.
  if not v_product.is_active then
    return jsonb_build_object('units', 0, 'value_cents', 0, 'already_removed', true);
  end if;

  v_units := v_product.quantity_in_stock;

  if v_units > 0 then
    -- Priced from the batches, so an article holding stock bought at two different prices
    -- gives back what was really paid rather than a blended guess.
    perform public.reconcile_batches(p_product_id, v_units);
    v_alloc := public.consume_batches(p_product_id, v_units);

    select coalesce(sum((elem ->> 'quantity')::numeric
                        * (elem ->> 'unit_cost_cents')::numeric), 0)
      into v_value
      from jsonb_array_elements(v_alloc) as elem;

    update public.products set quantity_in_stock = 0 where id = p_product_id;

    insert into public.stock_movements (product_id, delta, reason, note, created_by)
    values (p_product_id, -v_units, 'adjustment',
            coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Removed from inventory'),
            auth.uid());

    if round(v_value) > 0 then
      insert into public.cash_movements
        (kind, amount_cents, product_id, product_name, note, created_by)
      values ('removal', round(v_value), p_product_id, v_product.name,
              coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Removed from inventory'),
              auth.uid());
    end if;
  end if;

  update public.products set is_active = false where id = p_product_id;

  return jsonb_build_object(
    'units',           v_units,
    'value_cents',     round(v_value),
    'already_removed', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The balance, with removals given their own line.
-- ---------------------------------------------------------------------------
drop function if exists public.report_budget();

create or replace function public.report_budget()
returns table (
  balance_cents        bigint,
  from_sales_cents     bigint,
  spent_restock_cents  bigint,
  spent_opening_cents  bigint,
  invested_cents       bigint,
  corrections_cents    bigint,
  refunded_cents       bigint,
  voided_cents         bigint,
  removed_cents        bigint,
  entry_count          bigint
)
language sql
stable
as $$
  select
    coalesce(sum(amount_cents), 0)::bigint,
    coalesce(sum(amount_cents) filter (where kind = 'sale'), 0)::bigint,
    coalesce(-sum(amount_cents) filter (where kind = 'restock'), 0)::bigint,
    coalesce(-sum(amount_cents) filter (where kind = 'opening'), 0)::bigint,
    coalesce(sum(amount_cents) filter (where kind = 'investment'), 0)::bigint,
    coalesce(sum(amount_cents) filter (where kind = 'correction'), 0)::bigint,
    coalesce(-sum(amount_cents) filter (where kind = 'refund'), 0)::bigint,
    coalesce(-sum(amount_cents) filter (where kind = 'void'), 0)::bigint,
    coalesce(sum(amount_cents) filter (where kind = 'removal'), 0)::bigint,
    count(*)::bigint
  from public.cash_movements;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.archive_product(uuid, text)',
    'public.report_budget()'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
