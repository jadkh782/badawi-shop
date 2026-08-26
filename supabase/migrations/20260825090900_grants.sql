-- ---------------------------------------------------------------------------
-- Nothing in this system is reachable without a session. Reporting functions run as the
-- caller, so row level security still applies inside them.
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.report_summary(timestamptz, timestamptz)',
    'public.report_top_products(timestamptz, timestamptz, integer)',
    'public.report_by_category(timestamptz, timestamptz)',
    'public.report_time_series(timestamptz, timestamptz, text, text)',
    'public.report_low_stock()'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
