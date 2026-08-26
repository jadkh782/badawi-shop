-- ---------------------------------------------------------------------------
-- Table privileges.
--
-- Row level security decides *which rows* a role may see. It has nothing to say about
-- whether that role may touch the table in the first place: that is an ordinary GRANT, and
-- without one Postgres refuses with "permission denied for table" before any policy is
-- consulted.
--
-- Supabase projects have historically handed these out by default, so it is easy to write a
-- schema that works in one project and fails in another. Granting them here explicitly makes
-- the schema self-contained and means it behaves the same wherever it is applied.
--
-- The grants deliberately mirror the policies exactly, so the two cannot drift apart:
-- anything the policies forbid is not granted either.
--
-- Each one is preceded by a revoke, because Supabase hands new tables a blanket GRANT ALL to
-- authenticated. Granting on top of that changes nothing: the role keeps TRUNCATE, and
-- TRUNCATE is not filtered by row level security the way select, insert, update and delete
-- are. A policy saying "sales are read-only" is no obstacle to emptying the table outright.
-- Revoking first makes the end state exactly what is written here, whatever the project
-- handed out beforehand.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;

revoke all on public.app_settings    from authenticated;
revoke all on public.categories      from authenticated;
revoke all on public.products        from authenticated;
revoke all on public.sales           from authenticated;
revoke all on public.sale_items      from authenticated;
revoke all on public.stock_movements from authenticated;
revoke all on public.sale_line_facts from authenticated;

-- Settings: the shop reads them everywhere and edits the rate.
grant select, update on public.app_settings to authenticated;

-- Categories and products are ordinary records the shop maintains.
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.products   to authenticated;

-- Money is read-only from the client. Sales are written only by checkout_sale, and the
-- stock ledger only by checkout_sale and adjust_stock, both of which run as the owner.
grant select on public.sales           to authenticated;
grant select on public.sale_items      to authenticated;
grant select on public.stock_movements to authenticated;
grant select on public.sale_line_facts to authenticated;

-- ---------------------------------------------------------------------------
-- And nothing at all for anonymous callers.
--
-- The anon key ships inside the app bundle and inside the APK, so it is public by
-- definition. It must be worthless without a session. This is belt and braces over the
-- policies, which already grant anon nothing: a future table added without a policy would
-- still be unreachable.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
