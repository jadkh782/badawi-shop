-- A starting set of shelves so Sell mode is usable the moment the first product is added.
-- Renaming or deleting any of these from the app is expected.
insert into public.categories (name, color, sort_order) values
  ('Drinks',      '#0ea5e9', 10),
  ('Snacks',      '#f59e0b', 20),
  ('Groceries',   '#22c55e', 30),
  ('Dairy',       '#60a5fa', 40),
  ('Bakery',      '#d97706', 50),
  ('Household',   '#8b5cf6', 60),
  ('Personal Care','#ec4899', 70),
  ('Tobacco',     '#78716c', 80),
  ('Other',       '#64748b', 90)
on conflict do nothing;
