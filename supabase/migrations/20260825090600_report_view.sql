-- ---------------------------------------------------------------------------
-- sale_line_facts: the single shape every report reads from.
--
-- A discount is taken against the whole basket, but reporting needs to know what each
-- product actually earned. The discount is therefore spread across the lines in proportion
-- to their value, so revenue per product, per category and per day all add back up to the
-- sale total instead of overstating it by the discount.
--
-- security_invoker means the view is subject to the same row level security as the tables
-- underneath it, rather than quietly running with the owner rights.
-- ---------------------------------------------------------------------------
create or replace view public.sale_line_facts
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
  si.quantity,
  si.unit_price_cents,
  si.unit_cost_cents,
  si.line_total_cents as gross_cents,
  si.line_cost_cents  as cost_cents,
  (si.line_total_cents - case
     when s.subtotal_cents > 0
       then round(s.discount_cents::numeric * si.line_total_cents / s.subtotal_cents)
     else 0
   end)::bigint as net_cents,
  (si.line_total_cents - case
     when s.subtotal_cents > 0
       then round(s.discount_cents::numeric * si.line_total_cents / s.subtotal_cents)
     else 0
   end - si.line_cost_cents)::bigint as net_profit_cents
from public.sale_items si
join public.sales s on s.id = si.sale_id;

grant select on public.sale_line_facts to authenticated;
