-- ---------------------------------------------------------------------------
-- Reporting functions. Aggregation happens in Postgres so the phone downloads a handful of
-- rows rather than the sales table.
-- ---------------------------------------------------------------------------

create or replace function public.report_summary(p_from timestamptz, p_to timestamptz)
returns table (
  total_sales_cents    bigint,
  total_cost_cents     bigint,
  total_profit_cents   bigint,
  total_discount_cents bigint,
  transaction_count    bigint,
  items_sold           numeric,
  paid_usd_cents       bigint,
  paid_lbp_cents       bigint
)
language sql
stable
as $$
  select
    coalesce(sum(total_cents), 0)::bigint,
    coalesce(sum(total_cost_cents), 0)::bigint,
    coalesce(sum(profit_cents), 0)::bigint,
    coalesce(sum(discount_cents), 0)::bigint,
    count(*)::bigint,
    coalesce(sum(item_count), 0)::numeric,
    coalesce(sum(total_cents) filter (where payment_currency = 'USD'), 0)::bigint,
    coalesce(sum(total_cents) filter (where payment_currency = 'LBP'), 0)::bigint
  from public.sales
  where sold_at >= p_from and sold_at < p_to;
$$;

-- Best sellers. Grouped on the snapshotted name so an article that has since been deleted
-- still shows up in the month it sold.
create or replace function public.report_top_products(
  p_from timestamptz, p_to timestamptz, p_limit integer default 20
)
returns table (
  product_id    uuid,
  product_name  text,
  barcode       text,
  category_name text,
  quantity_sold numeric,
  revenue_cents bigint,
  profit_cents  bigint
)
language sql
stable
as $$
  select
    (array_agg(f.product_id) filter (where f.product_id is not null))[1],
    f.product_name,
    max(f.barcode),
    max(f.category_name),
    sum(f.quantity)::numeric,
    sum(f.net_cents)::bigint,
    sum(f.net_profit_cents)::bigint
  from public.sale_line_facts f
  where f.sold_at >= p_from and f.sold_at < p_to
  group by f.product_name
  order by sum(f.quantity) desc, sum(f.net_cents) desc
  limit greatest(coalesce(p_limit, 20), 1);
$$;

create or replace function public.report_by_category(p_from timestamptz, p_to timestamptz)
returns table (
  category_name text,
  quantity_sold numeric,
  revenue_cents bigint,
  profit_cents  bigint
)
language sql
stable
as $$
  select
    f.category_name,
    sum(f.quantity)::numeric,
    sum(f.net_cents)::bigint,
    sum(f.net_profit_cents)::bigint
  from public.sale_line_facts f
  where f.sold_at >= p_from and f.sold_at < p_to
  group by f.category_name
  order by sum(f.net_cents) desc;
$$;
