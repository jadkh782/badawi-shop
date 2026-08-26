-- ---------------------------------------------------------------------------
-- report_time_series: the trend behind the chart, and the row-per-period grouping the Excel
-- export uses for its daily, weekly and monthly views.
--
-- Buckets are cut in the shop local time zone, not UTC. Without that, an evening sale in
-- Beirut lands in the following day and the daily totals quietly disagree with the till.
--
-- Empty periods come back as explicit zeroes so a quiet Sunday is a visible gap in the chart
-- rather than a missing point the line skips over.
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
    group by 1
  )
  select (periods.bucket at time zone p_timezone)::timestamptz,
         coalesce(totals.sales, 0)::bigint,
         coalesce(totals.profit, 0)::bigint,
         coalesce(totals.txns, 0)::bigint,
         coalesce(totals.items, 0)::numeric
  from periods
  left join totals on totals.bucket = periods.bucket
  order by periods.bucket;
end;
$$;

-- The restocking list.
create or replace function public.report_low_stock()
returns table (
  product_id    uuid,
  product_name  text,
  barcode       text,
  category_name text,
  stock         numeric,
  threshold     numeric,
  unit          text
)
language sql
stable
as $$
  select p.id,
         p.name,
         p.barcode,
         coalesce(c.name, 'Uncategorised'),
         p.quantity_in_stock,
         p.low_stock_threshold,
         p.unit
  from public.products p
  left join public.categories c on c.id = p.category_id
  where p.is_active
    and p.quantity_in_stock <= p.low_stock_threshold
  order by (p.quantity_in_stock <= 0) desc, p.quantity_in_stock asc, p.name asc;
$$;
