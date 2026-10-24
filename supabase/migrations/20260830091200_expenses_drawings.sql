-- ---------------------------------------------------------------------------
-- The two ways money leaves that have nothing to do with stock.
--
-- Everything the cash box knew about until now was goods: takings in, deliveries out,
-- corrections either way. But a shop pays rent, and the electricity bill does not care how
-- the week went. Those are real money leaving a real drawer, and a balance that ignores them
-- is a balance that says the shop is doing better than it is.
--
--   expense   rent, electricity, water, a repair. The shop spent it and it is gone.
--   drawing   the owner taking money out for themselves. Also gone, but it is not a cost of
--             running the shop, it is the point of running the shop.
--
-- They are kept apart on purpose. Lumping drawings in with expenses makes the shop look
-- unprofitable when it is merely paying its owner; lumping them in with nothing at all makes
-- the balance drift away from what is actually in the drawer. "Earned" already sets aside
-- money put in from outside, and now it sets aside money taken back out too.
--
-- Neither touches stock, so neither writes a stock movement. The only thing that changes is
-- how much there is to spend.
-- ---------------------------------------------------------------------------

alter table public.cash_movements
  drop constraint if exists cash_movements_kind_check;
alter table public.cash_movements
  add constraint cash_movements_kind_check check (
    kind in ('sale', 'restock', 'opening', 'investment', 'correction',
             'void', 'refund', 'removal', 'expense', 'drawing')
  );

alter table public.cash_movements
  drop constraint if exists cash_direction;
alter table public.cash_movements
  add constraint cash_direction check (
    (kind = 'sale'       and amount_cents >= 0) or
    (kind = 'investment' and amount_cents >= 0) or
    (kind = 'removal'    and amount_cents >= 0) or
    (kind = 'restock'    and amount_cents <= 0) or
    (kind = 'opening'    and amount_cents <= 0) or
    (kind = 'void'       and amount_cents <= 0) or
    (kind = 'refund'     and amount_cents <= 0) or
    -- A bill and a wage both only ever go one way.
    (kind = 'expense'    and amount_cents <= 0) or
    (kind = 'drawing'    and amount_cents <= 0) or
    -- Found stock costs money, missing stock gives it back. Both are corrections.
    (kind = 'correction')
  );

-- ---------------------------------------------------------------------------
-- pay_out: money leaving the drawer for something that is not stock.
--
-- Takes the amount as a positive figure, because that is how it is read off a bill and typed
-- into a box, and stores it negative like every other way money leaves. Doing that
-- conversion here rather than trusting the caller means a device cannot post a payment that
-- quietly adds to the balance.
--
-- The shop is allowed to go overdrawn. Rent falls due whether or not the week was good, and
-- an app that refuses to record it does not stop the money leaving, it just stops the books
-- knowing. The screen warns; the function records.
-- ---------------------------------------------------------------------------
create or replace function public.pay_out(
  p_kind         text,
  p_amount_cents bigint,
  p_note         text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_balance bigint;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to record a payment' using errcode = '42501';
  end if;

  if p_kind not in ('expense', 'drawing') then
    raise exception 'Unknown payment kind %', p_kind using errcode = '22023';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'A payment has to be more than nothing' using errcode = '22023';
  end if;

  insert into public.cash_movements (kind, amount_cents, note, created_by)
  values (p_kind, -p_amount_cents, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;

  select coalesce(sum(amount_cents), 0)::bigint into v_balance from public.cash_movements;

  return jsonb_build_object(
    'id',            v_id,
    'amount_cents',  p_amount_cents,
    'balance_cents', v_balance
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The balance, with the running costs and the owner's wages on their own lines.
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
  expenses_cents       bigint,
  drawings_cents       bigint,
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
    coalesce(-sum(amount_cents) filter (where kind = 'expense'), 0)::bigint,
    coalesce(-sum(amount_cents) filter (where kind = 'drawing'), 0)::bigint,
    count(*)::bigint
  from public.cash_movements;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.pay_out(text, bigint, text)',
    'public.report_budget()'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
