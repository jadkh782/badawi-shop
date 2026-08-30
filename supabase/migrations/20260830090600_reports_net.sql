-- ---------------------------------------------------------------------------
-- Reporting, once a sale can be taken back.
--
-- Two rules, and they are different on purpose.
--
-- A voided sale is filtered out wherever it appears. It did not happen, so it is not in the
-- figures for the day it was rung up on, and re-reading last week gives the corrected
-- picture rather than the one that was wrong at the time.
--
-- A refund is a dated event of its own and lands in the period it happened in. That keeps
-- today's report agreeing with today's cash drawer, which is the comparison the shop
-- actually makes, and it stops a month that has already been read changing underneath
-- whoever read it.
--
-- The mechanism for the second one is the fact view: refunded lines come back through it as
-- negative rows stamped with the refund date. Everything built on top then nets out without
-- knowing anything about refunds at all.
-- ---------------------------------------------------------------------------

-- Dropped rather than replaced: the view gains a column and both halves of the union have
-- to agree on types, neither of which CREATE OR REPLACE VIEW will do. Nothing depends on it
-- structurally, since every reporting function holds its query as text.
drop view if exists public.sale_line_facts;

create view public.sale_line_facts
with (security_invoker = on) as
select
  si.id,
  si.sale_id,
  s.sold_at,
  s.payment_currency,
  si.product_id,
  si.product_name,
  si.barcode,
  coalesce(si.category_name, 'Uncategorised') as category_name,
  si.unit,
  si.quantity::numeric(12,3) as quantity,
  si.unit_price_cents,
  si.unit_cost_cents,
  si.line_total_cents::bigint as gross_cents,
  si.line_cost_cents::bigint  as cost_cents,
  (si.line_total_cents - case
     when s.subtotal_cents > 0
       then round(s.discount_cents::numeric * si.line_total_cents / s.subtotal_cents)
     else 0
   end)::bigint as net_cents,
  (si.line_total_cents - case
     when s.subtotal_cents > 0
       then round(s.discount_cents::numeric * si.line_total_cents / s.subtotal_cents)
     else 0
   end - si.line_cost_cents)::bigint as net_profit_cents,
  false as is_refund
from public.sale_items si
join public.sales s on s.id = si.sale_id
where s.voided_at is null

union all

-- Goods handed back, as negatives on the day they came back.
select
  ri.id,
  r.sale_id,
  r.refunded_at as sold_at,
  s.payment_currency,
  ri.product_id,
  ri.product_name,
  ri.barcode,
  coalesce(ri.category_name, 'Uncategorised') as category_name,
  ri.unit,
  (-ri.quantity)::numeric(12,3),
  ri.unit_price_cents,
  ri.unit_cost_cents,
  (-ri.gross_cents)::bigint,
  (-ri.cost_cents)::bigint,
  (-ri.net_cents)::bigint,
  (-(ri.net_cents - ri.cost_cents))::bigint,
  true
from public.sale_refund_items ri
join public.sale_refunds r on r.id = ri.refund_id
join public.sales s        on s.id = r.sale_id
where s.voided_at is null;

grant select on public.sale_line_facts to authenticated;

-- ---------------------------------------------------------------------------
-- The headline figures, with what was handed back shown rather than buried.
--
-- Refunds are netted off the totals and also reported on their own line, because "we took
-- $400" and "we took $520 and gave $120 back" are the same balance and a different day.
-- ---------------------------------------------------------------------------
drop function if exists public.report_summary(timestamptz, timestamptz);

create or replace function public.report_summary(p_from timestamptz, p_to timestamptz)
returns table (
  total_sales_cents    bigint,
  total_cost_cents     bigint,
  total_profit_cents   bigint,
  total_discount_cents bigint,
  transaction_count    bigint,
  items_sold           numeric,
  paid_usd_cents       bigint,
  paid_lbp_cents       bigint,
  refunded_cents       bigint,
  refund_count         bigint,
  voided_cents         bigint,
  voided_count         bigint
)
language sql
stable
as $$
  with sold as (
    select
      coalesce(sum(total_cents), 0)::bigint      as total,
      coalesce(sum(total_cost_cents), 0)::bigint as cost,
      coalesce(sum(profit_cents), 0)::bigint     as profit,
      coalesce(sum(discount_cents), 0)::bigint   as discount,
      count(*)::bigint                           as txns,
      coalesce(sum(item_count), 0)::numeric      as items,
      coalesce(sum(total_cents) filter (where payment_currency = 'USD'), 0)::bigint as usd,
      coalesce(sum(total_cents) filter (where payment_currency = 'LBP'), 0)::bigint as lbp
    from public.sales
    where sold_at >= p_from and sold_at < p_to
      and voided_at is null
  ),
  back as (
    select
      coalesce(sum(r.total_cents), 0)::bigint  as total,
      coalesce(sum(r.cost_cents), 0)::bigint   as cost,
      coalesce(sum(r.profit_cents), 0)::bigint as profit,
      count(*)::bigint                         as refunds,
      coalesce(sum(r.item_count), 0)::numeric  as items,
      coalesce(sum(r.total_cents) filter (where s.payment_currency = 'USD'), 0)::bigint as usd,
      coalesce(sum(r.total_cents) filter (where s.payment_currency = 'LBP'), 0)::bigint as lbp
    from public.sale_refunds r
    join public.sales s on s.id = r.sale_id
    where r.refunded_at >= p_from and r.refunded_at < p_to
      and s.voided_at is null
  ),
  killed as (
    select coalesce(sum(total_cents), 0)::bigint as total, count(*)::bigint as txns
    from public.sales
    where voided_at >= p_from and voided_at < p_to
  )
  select
    sold.total - back.total,
    sold.cost - back.cost,
    sold.profit - back.profit,
    sold.discount,
    sold.txns,
    sold.items - back.items,
    sold.usd - back.usd,
    sold.lbp - back.lbp,
    back.total,
    back.refunds,
    killed.total,
    killed.txns
  from sold, back, killed;
$$;

-- ---------------------------------------------------------------------------
-- The trend, with refunds pulling their bucket down on the day they happened.
-- ---------------------------------------------------------------------------
create or replace function public.report_time_series(
  p_from     timestamptz,
  p_to       timestamptz,
  p_bucket   text default 'daily',
  p_timezone text default 'UTC'
)
returns table (
  bucket_start      timestamptz,
  sales_cents       bigint,
  profit_cents      bigint,
  transaction_count bigint,
  items_sold        numeric
)
language plpgsql
stable
as $$
declare
  v_unit text;
  v_step interval;
begin
  if p_bucket not in ('daily', 'weekly', 'monthly') then
    raise exception 'Unknown report bucket %', p_bucket using errcode = '22023';
  end if;

  v_unit := case p_bucket when 'weekly' then 'week' when 'monthly' then 'month' else 'day' end;
  v_step := case v_unit when 'week' then interval '1 week'
                        when 'month' then interval '1 month'
                        else interval '1 day' end;

  return query
  with periods as (
    select generate_series(
             date_trunc(v_unit, (p_from at time zone p_timezone)),
             date_trunc(v_unit, ((p_to - interval '1 microsecond') at time zone p_timezone)),
             v_step
           ) as bucket
  ),
  totals as (
    select date_trunc(v_unit, (s.sold_at at time zone p_timezone)) as bucket,
           sum(s.total_cents)::bigint  as sales,
           sum(s.profit_cents)::bigint as profit,
           count(*)::bigint            as txns,
           sum(s.item_count)::numeric  as items
    from public.sales s
    where s.sold_at >= p_from and s.sold_at < p_to
      and s.voided_at is null
    group by 1
  ),
  backs as (
    select date_trunc(v_unit, (r.refunded_at at time zone p_timezone)) as bucket,
           sum(r.total_cents)::bigint  as sales,
           sum(r.profit_cents)::bigint as profit,
           sum(r.item_count)::numeric  as items
    from public.sale_refunds r
    join public.sales s on s.id = r.sale_id
    where r.refunded_at >= p_from and r.refunded_at < p_to
      and s.voided_at is null
    group by 1
  )
  select (periods.bucket at time zone p_timezone)::timestamptz,
         (coalesce(totals.sales, 0) - coalesce(backs.sales, 0))::bigint,
         (coalesce(totals.profit, 0) - coalesce(backs.profit, 0))::bigint,
         coalesce(totals.txns, 0)::bigint,
         (coalesce(totals.items, 0) - coalesce(backs.items, 0))::numeric
  from periods
  left join totals on totals.bucket = periods.bucket
  left join backs  on backs.bucket  = periods.bucket
  order by periods.bucket;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_sales: the till roll, which the shop needs before it can void anything.
--
-- Voided sales stay in the list, struck through rather than vanished, because the question
-- "what happened to that sale" has to have an answer somewhere.
-- ---------------------------------------------------------------------------
create or replace function public.list_sales(
  p_from  timestamptz default null,
  p_to    timestamptz default null,
  p_limit integer default 50
)
returns table (
  id               uuid,
  sold_at          timestamptz,
  total_cents      bigint,
  profit_cents     bigint,
  item_count       numeric,
  payment_currency text,
  total_lbp        numeric,
  note             text,
  voided_at        timestamptz,
  void_reason      text,
  refunded_cents   bigint,
  refunded_items   numeric,
  refund_count     bigint
)
language sql
stable
as $$
  select s.id,
         s.sold_at,
         s.total_cents::bigint,
         s.profit_cents::bigint,
         s.item_count,
         s.payment_currency,
         s.total_lbp,
         s.note,
         s.voided_at,
         s.void_reason,
         coalesce(r.total, 0)::bigint,
         coalesce(r.items, 0)::numeric,
         coalesce(r.count, 0)::bigint
  from public.sales s
  left join lateral (
    select sum(total_cents) as total, sum(item_count) as items, count(*) as count
    from public.sale_refunds where sale_id = s.id
  ) r on true
  where (p_from is null or s.sold_at >= p_from)
    and (p_to is null or s.sold_at < p_to)
  order by s.sold_at desc, s.id desc
  limit greatest(coalesce(p_limit, 50), 1);
$$;

-- One sale in full, with what has already gone back per line, which is what the refund
-- screen needs to know before it can offer anything.
--
-- net_cents is the line less its share of the basket discount, and it is here because the
-- screen has to be able to say what a return is worth before it happens. Offering to hand
-- back the undiscounted price and then handing back less is the kind of small lie that
-- makes a shop stop trusting the till.
drop function if exists public.get_sale_lines(uuid);

create or replace function public.get_sale_lines(p_sale_id uuid)
returns table (
  id                uuid,
  product_id        uuid,
  product_name      text,
  barcode           text,
  category_name     text,
  unit              text,
  quantity          numeric,
  unit_price_cents  integer,
  unit_cost_cents   integer,
  line_total_cents  bigint,
  net_cents         bigint,
  refunded_quantity numeric
)
language sql
stable
as $$
  select si.id,
         si.product_id,
         si.product_name,
         si.barcode,
         si.category_name,
         si.unit,
         si.quantity,
         si.unit_price_cents,
         si.unit_cost_cents,
         si.line_total_cents::bigint,
         (si.line_total_cents - case
            when s.subtotal_cents > 0
              then round(s.discount_cents::numeric * si.line_total_cents / s.subtotal_cents)
            else 0
          end)::bigint,
         public.refunded_quantity(si.id)
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where si.sale_id = p_sale_id
  order by si.id;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.report_summary(timestamptz, timestamptz)',
    'public.report_time_series(timestamptz, timestamptz, text, text)',
    'public.list_sales(timestamptz, timestamptz, integer)',
    'public.get_sale_lines(uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
