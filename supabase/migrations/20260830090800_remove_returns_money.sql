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

-- ---------------------------------------------------------------------------
-- The two constraints that say which kinds exist, and which way each one moves, are
-- deliberately only dropped here and never re-added.
--
-- They used to be re-stated in every migration that widened them, which is correct going
-- forwards and wrong on a replay. schema.sql is the whole history pasted in order over a
-- live database, so this migration runs again on a shop that has since recorded a kind
-- invented later. Re-stating the shorter list then rejects a row that is perfectly valid,
-- and the paste fails with "violated by some row".
--
-- So the set of kinds has exactly one owner: the newest migration that changes it. Up to
-- that point the table simply carries no such constraint, which lasts microseconds inside
-- a single paste and cannot be observed by the app.
-- ---------------------------------------------------------------------------
alter table public.cash_movements
  drop constraint if exists cash_movements_kind_check;
alter table public.cash_movements
  drop constraint if exists cash_direction;

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
