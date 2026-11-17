-- ---------------------------------------------------------------------------
-- What a customer reads at the top and bottom of a receipt.
--
-- The shop prints now, and a slip of paper that says only "Badawi Shop" and a total is not
-- much use to anyone who wants to come back about it. A phone number and an address make it
-- a document the customer can act on, and the footer is where a shop puts whatever it needs
-- its customers to know: a thank you, or that returns need the receipt.
--
-- All three are nullable and all three are optional on the page. A shop that has not filled
-- them in prints a receipt without those lines rather than a receipt with blank ones, so
-- nothing has to be invented here to make printing work on day one.
--
-- Columns only. Grants and row level security on app_settings are table-wide and already
-- allow the shop to read and update it, so there is nothing to widen. The settings row also
-- survives reset_shop, which means these outlive a shop starting again from empty — the
-- phone number is a fact about the shop, not about its trading history.
-- ---------------------------------------------------------------------------

alter table public.app_settings add column if not exists shop_phone     text;
alter table public.app_settings add column if not exists shop_address   text;
alter table public.app_settings add column if not exists receipt_footer text;
