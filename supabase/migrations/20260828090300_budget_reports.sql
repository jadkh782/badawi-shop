-- ---------------------------------------------------------------------------
-- What is in the cash box, and how it got there.
-- ---------------------------------------------------------------------------
create or replace function public.report_budget()
returns table (
  balance_cents        bigint,
  from_sales_cents     bigint,
  spent_restock_cents  bigint,
  invested_cents       bigint,
  entry_count          bigint
)
language sql
stable
as $$
  select
    coalesce(sum(amount_cents), 0)::bigint,
    coalesce(sum(amount_cents) filter (where kind = 'sale'), 0)::bigint,
    -- Stored negative; reported as the positive amount that was spent.
    coalesce(-sum(amount_cents) filter (where kind = 'restock'), 0)::bigint,
    coalesce(sum(amount_cents) filter (where kind = 'investment'), 0)::bigint,
    count(*)::bigint
  from public.cash_movements;
$$;

-- The ledger itself, newest first, so the balance can always be traced to its causes.
create or replace function public.list_cash_movements(p_limit integer default 100)
returns table (
  id           uuid,
  kind         text,
  amount_cents bigint,
  product_name text,
  note         text,
  created_at   timestamptz
)
language sql
stable
as $$
  select m.id, m.kind, m.amount_cents, m.product_name, m.note, m.created_at
  from public.cash_movements m
  order by m.created_at desc, m.id desc
  limit greatest(coalesce(p_limit, 100), 1);
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.report_budget()',
    'public.list_cash_movements(integer)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
