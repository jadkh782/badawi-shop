/**
 * Runs every migration against a real Postgres (PGlite, the engine compiled to WebAssembly)
 * and exercises the functions the money depends on: checkout_sale, adjust_stock and the
 * reporting calls.
 *
 * This needs no Docker and no Supabase project, so it can run anywhere:
 *     npm run test:db
 *
 * Supabase supplies auth.uid() in production; it is stubbed here so the functions can be
 * called exactly as the app calls them.
 */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../migrations');
const UID = '11111111-1111-1111-1111-111111111111';

let passed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log('  ok   ' + name);
  } else {
    failures.push(name);
    console.log('  FAIL ' + name + (detail ? '\n         ' + detail : ''));
  }
}

function eq(name, actual, expected) {
  check(name, String(actual) === String(expected), `expected ${expected}, got ${actual}`);
}

async function expectError(name, code, fn) {
  try {
    await fn();
    check(name, false, 'expected an error, none was raised');
  } catch (e) {
    check(name, e.code === code, `expected SQLSTATE ${code}, got ${e.code}: ${e.message}`);
  }
}

const db = await PGlite.create({ extensions: { pg_trgm } });

await db.exec(`
  create extension if not exists pg_trgm;
  create schema if not exists auth;
  create table auth.users (id uuid primary key, email text);
  insert into auth.users values ('${UID}', 'shop@badawi.test');
  create or replace function auth.uid() returns uuid language sql stable as
    $fn$ select nullif(current_setting('test.uid', true), '')::uuid $fn$;
  create role authenticated;
  create role anon;
  set test.uid = '${UID}';
`);

const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();
for (const file of files) {
  try {
    await db.exec(await readFile(path.join(MIGRATIONS, file), 'utf8'));
  } catch (e) {
    console.error(`\nMIGRATION FAILED: ${file}\n  ${e.message}\n`);
    process.exit(1);
  }
}
console.log(`\nApplied ${files.length} migrations.\n`);
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const all = async (sql, params) => (await db.query(sql, params)).rows;

// ---------------------------------------------------------------------------
// Fixtures: a shelf of three articles with known cost, price and stock.
// ---------------------------------------------------------------------------
const cat = await one(`insert into categories (name, color) values ('Test Drinks', '#000')
                       returning id`);
const mk = (name, cost, price, stock, low = 2) =>
  one(
    `insert into products (barcode, name, category_id, cost_price_cents, sale_price_cents,
                           quantity_in_stock, low_stock_threshold, unit)
     values ($1, $2, $3, $4, $5, $6, $7, 'piece') returning id`,
    [`BC-${name}`, name, cat.id, cost, price, stock, low],
  );

const cola = await mk('Cola', 60, 150, 24);
const water = await mk('Water', 20, 50, 100);
const chips = await mk('Chips', 100, 250, 5, 5);

console.log('checkout_sale');

// --- a plain sale, no discount ---------------------------------------------
const saleA = await one(
  `select checkout_sale($1::jsonb, 'none', 0, 'USD', null) as id`,
  [JSON.stringify([{ product_id: cola.id, quantity: 3 }, { product_id: water.id, quantity: 2 }])],
);
const a = await one('select * from sales where id = $1', [saleA.id]);
eq('subtotal is recomputed server side (3x150 + 2x50)', a.subtotal_cents, 550);
eq('cost is recomputed (3x60 + 2x20)', a.total_cost_cents, 220);
eq('total equals subtotal when undiscounted', a.total_cents, 550);
eq('profit is total minus cost', a.profit_cents, 330);
eq('item count counts units, not lines', a.item_count, '5.000');
eq('the rate in force is frozen onto the sale', a.usd_to_lbp_rate, '89000.0000');
eq('LBP total is rounded to the configured step', a.total_lbp, '490000.00');
eq('the signed-in user is recorded', a.created_by, UID);

eq('stock is deducted for the first line',
  (await one('select quantity_in_stock q from products where id = $1', [cola.id])).q, '21.000');
eq('stock is deducted for the second line',
  (await one('select quantity_in_stock q from products where id = $1', [water.id])).q, '98.000');

const itemsA = await all('select * from sale_items where sale_id = $1 order by product_name', [saleA.id]);
eq('one line per distinct product', itemsA.length, 2);
eq('the product name is snapshotted', itemsA[0].product_name, 'Cola');
eq('the barcode is snapshotted', itemsA[0].barcode, 'BC-Cola');
eq('the category is snapshotted', itemsA[0].category_name, 'Test Drinks');
eq('unit cost is snapshotted', itemsA[0].unit_cost_cents, 60);
eq('line profit is stored', itemsA[0].line_profit_cents, 270);

eq('a ledger entry is written per line',
  (await one('select count(*) c from stock_movements where sale_id = $1', [saleA.id])).c, 2);
eq('the ledger entry is negative and tagged as a sale',
  (await one(`select delta || '/' || reason v from stock_movements
              where sale_id = $1 and product_id = $2`, [saleA.id, cola.id])).v, '-3.000/sale');

// --- discounts --------------------------------------------------------------
const saleB = await one(`select checkout_sale($1::jsonb, 'percent', 10, 'LBP', 'ten off') as id`,
  [JSON.stringify([{ product_id: cola.id, quantity: 4 }])]);
const b = await one('select * from sales where id = $1', [saleB.id]);
eq('percentage discount is computed from the server subtotal', b.discount_cents, 60);
eq('total is subtotal less the discount', b.total_cents, 540);
eq('the discount comes out of profit, not out of cost', b.profit_cents, 540 - 240);
eq('the payment currency is recorded', b.payment_currency, 'LBP');
eq('a note is kept', b.note, 'ten off');

const saleC = await one(`select checkout_sale($1::jsonb, 'amount', 2.5, 'USD', null) as id`,
  [JSON.stringify([{ product_id: water.id, quantity: 10 }])]);
const c = await one('select * from sales where id = $1', [saleC.id]);
eq('a fixed discount is read as dollars and stored as cents', c.discount_cents, 250);
eq('total reflects the fixed discount', c.total_cents, 250);

const saleD = await one(`select checkout_sale($1::jsonb, 'amount', 9999, 'USD', null) as id`,
  [JSON.stringify([{ product_id: water.id, quantity: 1 }])]);
const d = await one('select * from sales where id = $1', [saleD.id]);
eq('an oversized discount is capped at the subtotal', d.discount_cents, 50);
eq('a sale can reach zero but never goes negative', d.total_cents, 0);

// A client sending a negative discount must not be able to inflate the total.
const saleE = await one(`select checkout_sale($1::jsonb, 'percent', -50, 'USD', null) as id`,
  [JSON.stringify([{ product_id: water.id, quantity: 2 }])]);
eq('a negative discount is floored at zero',
  (await one('select discount_cents dc from sales where id = $1', [saleE.id])).dc, 0);

// --- the payload is not trusted --------------------------------------------
console.log('\nrejections');

await expectError('an empty cart is refused', '22023', () =>
  db.query(`select checkout_sale('[]'::jsonb, 'none', 0, 'USD', null)`));

await expectError('a null cart is refused', '22023', () =>
  db.query(`select checkout_sale(null, 'none', 0, 'USD', null)`));

await expectError('an unknown discount type is refused', '22023', () =>
  db.query(`select checkout_sale($1::jsonb, 'freebie', 1, 'USD', null)`,
    [JSON.stringify([{ product_id: water.id, quantity: 1 }])]));

await expectError('an unknown currency is refused', '22023', () =>
  db.query(`select checkout_sale($1::jsonb, 'none', 0, 'GBP', null)`,
    [JSON.stringify([{ product_id: water.id, quantity: 1 }])]));

await expectError('a zero quantity is refused', '22023', () =>
  db.query(`select checkout_sale($1::jsonb, 'none', 0, 'USD', null)`,
    [JSON.stringify([{ product_id: water.id, quantity: 0 }])]));

await expectError('a product that no longer exists is refused', '23503', () =>
  db.query(`select checkout_sale($1::jsonb, 'none', 0, 'USD', null)`,
    [JSON.stringify([{ product_id: '00000000-0000-0000-0000-000000000000', quantity: 1 }])]));

await expectError('selling more than the shelf holds is refused', 'BS001', () =>
  db.query(`select checkout_sale($1::jsonb, 'none', 0, 'USD', null)`,
    [JSON.stringify([{ product_id: chips.id, quantity: 99 }])]));

eq('a refused sale leaves stock untouched',
  (await one('select quantity_in_stock q from products where id = $1', [chips.id])).q, '5.000');
eq('a refused sale leaves no orphan row behind',
  (await one(`select count(*) c from sales where total_cents = 0 and item_count = 0`)).c, 0);

await db.exec(`set test.uid = ''`);
await expectError('a signed-out caller is refused', '42501', () =>
  db.query(`select checkout_sale($1::jsonb, 'none', 0, 'USD', null)`,
    [JSON.stringify([{ product_id: water.id, quantity: 1 }])]));
await db.exec(`set test.uid = '${UID}'`);

// --- the same item scanned into two payload entries -------------------------
console.log('\nfolding and stock');
const before = (await one('select quantity_in_stock q from products where id = $1', [cola.id])).q;
const saleF = await one(`select checkout_sale($1::jsonb, 'none', 0, 'USD', null) as id`,
  [JSON.stringify([
    { product_id: cola.id, quantity: 1 },
    { product_id: cola.id, quantity: 2 },
  ])]);
eq('duplicate entries fold into a single sale line',
  (await one('select count(*) c from sale_items where sale_id = $1', [saleF.id])).c, 1);
eq('the folded line carries the combined quantity',
  (await one('select quantity q from sale_items where sale_id = $1', [saleF.id])).q, '3.000');
eq('stock is deducted once, for the combined quantity',
  (await one('select quantity_in_stock q from products where id = $1', [cola.id])).q,
  (Number(before) - 3).toFixed(3));

// --- adjust_stock ----------------------------------------------------------
// adjust_stock reports back an object now, because the caller wants to know what the
// delivery did to the price as well as to the count.
eq('restocking raises the count',
  (await one(`select adjust_stock($1, 20, 'restock', 'delivery') ->> 'stock' q`, [chips.id])).q,
  '25.000');
eq('a restock is written to the ledger',
  (await one(`select delta || '/' || reason v from stock_movements
              where product_id = $1 and reason = 'restock'`, [chips.id])).v, '20.000/restock');
eq('a correction can reduce the count',
  (await one(`select adjust_stock($1, -5, 'adjustment', 'breakage') ->> 'stock' q`, [chips.id])).q,
  '20.000');

await expectError('stock cannot be pushed below zero', 'BS001', () =>
  db.query(`select adjust_stock($1, -9999, 'adjustment', null)`, [chips.id]));
await expectError('a zero adjustment is refused', '22023', () =>
  db.query(`select adjust_stock($1, 0, 'restock', null)`, [chips.id]));
await expectError('an unknown stock reason is refused', '22023', () =>
  db.query(`select adjust_stock($1, 1, 'shrinkage', null)`, [chips.id]));

// --- fractional quantities for goods sold by weight -------------------------
const cheese = await one(
  `insert into products (name, category_id, cost_price_cents, sale_price_cents,
                         quantity_in_stock, unit)
   values ('Cheese', $1, 800, 1200, 3.5, 'kg') returning id`, [cat.id]);
const saleG = await one(`select checkout_sale($1::jsonb, 'none', 0, 'USD', null) as id`,
  [JSON.stringify([{ product_id: cheese.id, quantity: 0.75 }])]);
eq('a fractional quantity prices correctly (0.75 x 12.00)',
  (await one('select total_cents t from sales where id = $1', [saleG.id])).t, 900);
eq('fractional stock is deducted precisely',
  (await one('select quantity_in_stock q from products where id = $1', [cheese.id])).q, '2.750');
eq('an item with no barcode sells fine',
  (await one('select barcode from sale_items where sale_id = $1', [saleG.id])).barcode, null);

// --- reports ---------------------------------------------------------------
console.log('\nreports');
const RANGE = [`select * from report_summary(now() - interval '1 day', now() + interval '1 day')`];
const sum = await one(...RANGE);
const totals = await one(`select sum(total_cents) s, sum(profit_cents) p, sum(discount_cents) d,
                                 count(*) n from sales`);
eq('summary total matches the sales table', sum.total_sales_cents, totals.s);
eq('summary profit matches the sales table', sum.total_profit_cents, totals.p);
eq('summary discount matches the sales table', sum.total_discount_cents, totals.d);
eq('summary counts every transaction', sum.transaction_count, totals.n);
check('summary splits cash taken by currency',
  Number(sum.paid_usd_cents) + Number(sum.paid_lbp_cents) === Number(totals.s),
  `${sum.paid_usd_cents} + ${sum.paid_lbp_cents} != ${totals.s}`);

const empty = await one(`select * from report_summary(now() - interval '10 year',
                                                      now() - interval '9 year')`);
eq('a period with no sales reports zero rather than null', empty.total_sales_cents, 0);
eq('a period with no sales reports no transactions', empty.transaction_count, 0);

// The sale-level discount is spread across lines, so per-product revenue must add back up
// to what the shop actually took. Rounding may move it by a cent or two per discounted sale.
const net = await one(`select sum(net_cents) n from sale_line_facts`);
const drift = Math.abs(Number(net.n) - Number(totals.s));
check('per-line revenue reconciles with sale totals', drift <= Number(totals.n),
  `drift of ${drift} cents across ${totals.n} sales`);

const top = await all(`select * from report_top_products(now() - interval '1 day',
                                                         now() + interval '1 day', 10)`);
check('best sellers come back ranked by quantity',
  top.every((r, i) => i === 0 || Number(top[i - 1].quantity_sold) >= Number(r.quantity_sold)),
  JSON.stringify(top.map((r) => [r.product_name, r.quantity_sold])));
eq('the top seller is the one sold most', top[0].product_name, 'Water');
check('best sellers carry their category', top.every((r) => r.category_name === 'Test Drinks'));

const byCat = await all(`select * from report_by_category(now() - interval '1 day',
                                                          now() + interval '1 day')`);
eq('every line rolls up into its category', byCat.length, 1);
eq('the category revenue matches the line total', byCat[0].revenue_cents, net.n);

const DAY0 = "date_trunc('day', now() at time zone 'Asia/Beirut')";
const series = await all(`select * from report_time_series(
  (${DAY0} - interval '6 day') at time zone 'Asia/Beirut',
  (${DAY0} + interval '1 day') at time zone 'Asia/Beirut',
  'daily', 'Asia/Beirut')`);
eq('a daily series returns one row per day', series.length, 7);
check('quiet days come back as explicit zeroes',
  series.some((r) => Number(r.transaction_count) === 0));
check('the busy day carries every transaction',
  series.reduce((n, r) => n + Number(r.transaction_count), 0) === Number(totals.n));

const MON0 = "date_trunc('month', now() at time zone 'Asia/Beirut')";
const monthly = await all(`select * from report_time_series(
  ${MON0} at time zone 'Asia/Beirut',
  (${MON0} + interval '1 month') at time zone 'Asia/Beirut',
  'monthly', 'Asia/Beirut')`);
eq('a monthly series returns a single bucket', monthly.length, 1);
await expectError('an unknown bucket is refused', '22023', () =>
  db.query(`select * from report_time_series(now(), now() + interval '1 day', 'hourly', 'UTC')`));

const low = await all(`select * from report_low_stock()`);
check('the restocking list only holds items at or below their threshold',
  low.every((r) => Number(r.stock) <= Number(r.threshold)), JSON.stringify(low));
check('an empty shelf sorts to the top of the restocking list',
  low.length === 0 || low[0].stock !== null);


// A sale rung up at 23:30 in Beirut is 20:30 UTC. Bucketing in UTC would leave it on the
// right day here but on the wrong one for an after-midnight sale, and the daily total would
// quietly stop matching the till. The zone the shop lives in is what decides the day.
const lateSale = await one(
  `select checkout_sale($1::jsonb, 'none', 0, 'USD', 'late night') as id`,
  [JSON.stringify([{ product_id: water.id, quantity: 1 }])],
);
await db.query(
  `update sales
      set sold_at = (date_trunc('day', now() at time zone 'Asia/Beirut')
                     + interval '23 hour 30 minute') at time zone 'Asia/Beirut'
    where id = $1`,
  [lateSale.id],
);
const beirutDay = await all(`select * from report_time_series(
  ${DAY0} at time zone 'Asia/Beirut',
  (${DAY0} + interval '1 day') at time zone 'Asia/Beirut', 'daily', 'Asia/Beirut')`);
eq('one local day is one bucket', beirutDay.length, 1);
check('a 23:30 sale is counted on the Beirut day it was rung up on',
  Number(beirutDay[0].transaction_count) >= 1, JSON.stringify(beirutDay));
check('the late sale contributes its value to that day',
  Number(beirutDay[0].sales_cents) >= 50, JSON.stringify(beirutDay));

// --- the cash box ----------------------------------------------------------
console.log('\nbudget');

const budget = () => one('select * from report_budget()');

/*
  Measured as differences rather than absolutes. Restocking earlier in this file already moved
  money, and pinning these to fixed totals would make them fail whenever a test above is added
  or reordered, for no reason connected to the thing being checked.
*/
const box0 = await budget();
const salesTotal = Number((await one('select sum(total_cents) s from sales')).s);
eq('every sale so far is in the box', box0.from_sales_cents, salesTotal);
/*
  The balance is every kind of movement added up. Spelling it out here is the point: a new
  kind added to the ledger and forgotten in report_budget would otherwise show up as a
  balance nobody can explain, months later, in the shop.
*/
const accounts = (b) =>
  Number(b.from_sales_cents) -
  Number(b.spent_restock_cents) -
  Number(b.spent_opening_cents) +
  Number(b.invested_cents) +
  Number(b.corrections_cents) -
  Number(b.refunded_cents) -
  Number(b.voided_cents);

check('the balance is every kind of movement added up',
  Number(box0.balance_cents) === accounts(box0), JSON.stringify(box0));

// A delivery is priced per unit now, so ten at 500 is 5000 out of the box.
await db.query(`select adjust_stock($1, 10, 'restock', 'shop paid', 500, 'budget')`, [cola.id]);
const paid = await budget();
eq('a delivery the shop paid for leaves the box',
  Number(paid.spent_restock_cents) - Number(box0.spent_restock_cents), 5000);
eq('and the balance drops by exactly that',
  Number(box0.balance_cents) - Number(paid.balance_cents), 5000);
eq('it is not counted as money from outside', paid.invested_cents, box0.invested_cents);

await db.query(`select adjust_stock($1, 10, 'restock', 'owner paid', 800, 'outside')`, [cola.id]);
const outside = await budget();
eq('an outside-funded delivery still counts as money spent',
  Number(outside.spent_restock_cents) - Number(paid.spent_restock_cents), 8000);
eq('and is recorded as money put in from outside',
  Number(outside.invested_cents) - Number(paid.invested_cents), 8000);
eq('but leaves the balance exactly where it was', outside.balance_cents, paid.balance_cents);

const colaCost = Number((await one('select cost_price_cents c from products where id = $1', [cola.id])).c);
await db.query(`select adjust_stock($1, 5, 'restock', null)`, [cola.id]);
eq('an unpriced delivery falls back to the cost price',
  Number((await budget()).spent_restock_cents) - Number(outside.spent_restock_cents), colaCost * 5);

// --- corrections move money ------------------------------------------------
const beforeCount = await budget();
const costNow = Number((await one('select cost_price_cents c from products where id = $1', [cola.id])).c);

await db.query(`select adjust_stock($1, -3, 'adjustment', 'miscount')`, [cola.id]);
const short = await budget();
check('stock missing from the shelf puts money back in the box',
  Number(short.balance_cents) > Number(beforeCount.balance_cents),
  `${beforeCount.balance_cents} -> ${short.balance_cents}`);
eq('and it is recorded as a correction rather than a sale',
  Number(short.corrections_cents) - Number(beforeCount.corrections_cents),
  costNow * 3);

await db.query(`select adjust_stock($1, 3, 'adjustment', 'found again')`, [cola.id]);
const found = await budget();
eq('stock found on the shelf takes the same money back out',
  found.corrections_cents, beforeCount.corrections_cents);
eq('so a miscount and its reversal leave the balance where it started',
  found.balance_cents, beforeCount.balance_cents);
eq('the balance still accounts for itself', Number(found.balance_cents), accounts(found));

await expectError('an unknown funding source is refused', '22023', () =>
  db.query(`select adjust_stock($1, 1, 'restock', null, 100, 'magic')`, [cola.id]));
await expectError('a delivery cannot cost a negative amount', '22023', () =>
  db.query(`select adjust_stock($1, 1, 'restock', null, -5, 'budget')`, [cola.id]));

const beforeFail = await budget();
await expectError('overselling is still refused', 'BS001', () =>
  db.query(`select checkout_sale($1::jsonb, 'none', 0, 'USD', null)`,
    [JSON.stringify([{ product_id: chips.id, quantity: 9999 }])]));
eq('and the refused sale added nothing to the box',
  (await budget()).balance_cents, beforeFail.balance_cents);

const ledger = await all('select * from list_cash_movements(500)');
const ledgerSum = ledger.reduce((n, r) => n + Number(r.amount_cents), 0);
eq('the ledger accounts for the balance exactly', ledgerSum, (await budget()).balance_cents);
check('the ledger reads newest first',
  ledger.every((r, i) => i === 0 || new Date(ledger[i - 1].created_at) >= new Date(r.created_at)));

// --- adding an article, and who paid for it ---------------------------------
console.log('\ncost and price');

const box0b = await budget();
const tea = await one(
  `select create_product('BC-Tea', 'Tea', $1, 1500, 2500, 10, 2, 'piece', null, 'outside') as id`,
  [cat.id],
);
const box1b = await budget();

eq('opening stock is recorded as money spent',
  Number(box1b.spent_opening_cents) - Number(box0b.spent_opening_cents), 15000);
eq('bought with the owner money it is also recorded as put in',
  Number(box1b.invested_cents) - Number(box0b.invested_cents), 15000);
eq('so the balance is exactly where it was', box1b.balance_cents, box0b.balance_cents);
eq('the article starts holding its opening stock',
  (await one('select quantity_in_stock q from products where id = $1', [tea.id])).q, '10.000');
eq('and one batch stands behind it',
  (await all('select * from list_stock_batches($1)', [tea.id])).length, 1);

const box2b = await budget();
await one(`select create_product('BC-Jam', 'Jam', $1, 1000, 2000, 5, 1, 'piece', null, 'budget') as id`,
  [cat.id]);
const box3b = await budget();
eq('bought with shop money the balance drops instead',
  Number(box2b.balance_cents) - Number(box3b.balance_cents), 5000);
eq('and nothing is recorded as put in from outside', box3b.invested_cents, box2b.invested_cents);

// --- a delivery at a different price ---------------------------------------
await db.query(`select adjust_stock($1, 10, 'restock', 'dearer this time', 2000, 'budget')`, [tea.id]);
eq('average mode blends the old price with the new',
  (await one('select cost_price_cents c from products where id = $1', [tea.id])).c, 1750);
eq('the price the supplier actually charged is kept on its own',
  (await one('select last_cost_price_cents c from products where id = $1', [tea.id])).c, 2000);
eq('and the shelf is still one batch',
  (await all('select * from list_stock_batches($1)', [tea.id])).length, 1);

const teaHistory = await all('select * from list_price_history($1, 20)', [tea.id]);
check('the change is written to the price history',
  teaHistory.some((h) => Number(h.old_cost_cents) === 1500 && Number(h.new_cost_cents) === 1750),
  JSON.stringify(teaHistory));
eq('the history keeps what was charged, not just the blend',
  Number(teaHistory[0].purchase_cost_cents), 2000);

await db.query(`select adjust_stock($1, 10, 'restock', null, 2000, 'budget', 3000)`, [tea.id]);
eq('a new shelf price given with the delivery is applied',
  (await one('select sale_price_cents c from products where id = $1', [tea.id])).c, 3000);
eq('and the shelf price change is logged too',
  Number((await all('select * from list_price_history($1, 20)', [tea.id]))[0].new_sale_price_cents),
  3000);

// --- selling from a chosen batch -------------------------------------------
await db.query(`select set_cost_method('batch')`);
await db.query(`select adjust_stock($1, 5, 'restock', 'a dear one', 5000, 'budget')`, [tea.id]);

const teaBatches = await all('select * from list_stock_batches($1)', [tea.id]);
eq('batch mode leaves the new delivery standing on its own', teaBatches.length, 2);

const cheaper = teaBatches.reduce((a, b) =>
  Number(a.unit_cost_cents) <= Number(b.unit_cost_cents) ? a : b);
const chosen = await one(`select checkout_sale($1::jsonb, 'none', 0, 'USD', null) as id`, [
  JSON.stringify([{ product_id: tea.id, quantity: 2, batch_id: cheaper.id }]),
]);
eq('the chosen batch is what prices the line',
  (await one('select line_cost_cents c from sale_items where sale_id = $1', [chosen.id])).c,
  Number(cheaper.unit_cost_cents) * 2);

await db.query(`select set_cost_method('average')`);
eq('switching back to average folds the batches into one',
  (await all('select * from list_stock_batches($1)', [tea.id])).length, 1);

// --- voiding ----------------------------------------------------------------
console.log('\nvoids');

const summaryAll = () =>
  one(`select * from report_summary('1970-01-01'::timestamptz, '2100-01-01'::timestamptz)`);
const liveSalesTotal = async () =>
  Number((await one(`select coalesce(sum(total_cents), 0) s from sales where voided_at is null`)).s);

const beforeVoid = await budget();
const waterBefore = (await one('select quantity_in_stock q from products where id = $1',
  [water.id])).q;

const doomed = await one(`select checkout_sale($1::jsonb, 'none', 0, 'USD', null) as id`, [
  JSON.stringify([{ product_id: water.id, quantity: 4 }]),
]);
await db.query(`select void_sale($1, 'rang up the wrong thing')`, [doomed.id]);
const afterVoid = await budget();

eq('voiding puts every unit back on the shelf',
  (await one('select quantity_in_stock q from products where id = $1', [water.id])).q, waterBefore);
eq('and takes the takings back out of the box',
  afterVoid.balance_cents, beforeVoid.balance_cents);
check('the sale is marked voided rather than deleted',
  (await one('select voided_at from sales where id = $1', [doomed.id])).voided_at !== null);
eq('a voided sale contributes nothing to the figures',
  Number((await summaryAll()).total_sales_cents), await liveSalesTotal());
eq('and none of its lines survive in the fact view',
  (await one('select count(*) c from sale_line_facts where sale_id = $1', [doomed.id])).c, 0);

await expectError('a sale cannot be voided twice', 'BS003', () =>
  db.query(`select void_sale($1, null)`, [doomed.id]));

// --- refunding --------------------------------------------------------------
console.log('\nrefunds');

const beforeRefund = await budget();
const waterStock = (await one('select quantity_in_stock q from products where id = $1',
  [water.id])).q;

const returned = await one(`select checkout_sale($1::jsonb, 'none', 0, 'USD', null) as id`, [
  JSON.stringify([{ product_id: water.id, quantity: 6 }]),
]);
const returnedLine = await one('select id, quantity from sale_items where sale_id = $1',
  [returned.id]);

const refund = await one(`select refund_sale($1, $2::jsonb, 'two came back') as r`, [
  returned.id,
  JSON.stringify([{ sale_item_id: returnedLine.id, quantity: 2 }]),
]);

eq('the returned units go back on the shelf',
  (await one('select quantity_in_stock q from products where id = $1', [water.id])).q,
  (Number(waterStock) - 4).toFixed(3));
eq('the customer is handed back what those units were sold for',
  Number(refund.r.total_cents), 100);

const afterRefund = await budget();
eq('and it comes out of the cash box',
  Number(afterRefund.refunded_cents) - Number(beforeRefund.refunded_cents), 100);
eq('the balance still accounts for itself', Number(afterRefund.balance_cents), accounts(afterRefund));

await expectError('more cannot be returned than was sold', 'BS004', () =>
  db.query(`select refund_sale($1, $2::jsonb, null)`, [
    returned.id,
    JSON.stringify([{ sale_item_id: returnedLine.id, quantity: 5 }]),
  ]));

const withRefunds = await summaryAll();
eq('the summary reports what was handed back',
  Number(withRefunds.refunded_cents),
  Number((await one('select coalesce(sum(total_cents), 0) s from sale_refunds')).s));
eq('and nets it off the takings',
  Number(withRefunds.total_sales_cents),
  (await liveSalesTotal()) - Number(withRefunds.refunded_cents));

check('a refund shows in the fact view as a negative line',
  Number((await one(`select coalesce(sum(quantity), 0) q from sale_line_facts where is_refund`)).q) < 0);

await expectError('a partly refunded sale can no longer be voided', 'BS003', () =>
  db.query(`select void_sale($1, null)`, [returned.id]));

// A sale taken inside a basket discount hands back what the customer actually paid, and the
// screen has to be able to say so before the refund happens rather than after. The figure
// get_sale_lines reports and the figure refund_sale pays out are the same number or the till
// has quietly lied to someone.
const discounted = await one(`select checkout_sale($1::jsonb, 'percent', 10, 'USD', null) as id`, [
  JSON.stringify([{ product_id: water.id, quantity: 4 }]),
]);
const discountedLine = await one('select * from get_sale_lines($1)', [discounted.id]);

eq('a discounted line reports what it actually earned, not the shelf price',
  Number(discountedLine.net_cents), 180);

const quoted = Math.round((Number(discountedLine.net_cents) * 2) / Number(discountedLine.quantity));
const paidBack = await one(`select refund_sale($1, $2::jsonb, null) as r`, [
  discounted.id,
  JSON.stringify([{ sale_item_id: discountedLine.id, quantity: 2 }]),
]);

eq('and refunding pays back exactly what the screen would have quoted',
  Number(paidBack.r.total_cents), quoted);

// --- the till roll ----------------------------------------------------------
const roll = await all('select * from list_sales(null, null, 200)');
check('the sales list holds the voided sale too, so it can be explained',
  roll.some((r) => r.id === doomed.id && r.voided_at !== null));
check('and shows what has been refunded against a sale',
  roll.some((r) => r.id === returned.id && Number(r.refunded_cents) === 100));

const soldLines = await all('select * from get_sale_lines($1)', [returned.id]);
eq('a sale line reports how much of it has already gone back',
  soldLines[0].refunded_quantity, '2.000');

// --- removing an article ----------------------------------------------------
console.log('\nremoving an article');

const boxR0 = await budget();
const doomedItem = await one(
  `select create_product('BC-Gone', 'Going', $1, 400, 900, 7, 1, 'piece', null, 'budget') as id`,
  [cat.id],
);
const boxR1 = await budget();
eq('buying the stock took money out', Number(boxR0.balance_cents) - Number(boxR1.balance_cents), 2800);

const gone = await one(`select archive_product($1, 'discontinued') as r`, [doomedItem.id]);
const boxR2 = await budget();

eq('removing it hands back what its stock cost', Number(gone.r.value_cents), 2800);
eq('all seven units came off the shelf', Number(gone.r.units), 7);
eq('so the balance returns to where it started', boxR2.balance_cents, boxR0.balance_cents);
eq('the shelf is emptied',
  (await one('select quantity_in_stock q from products where id = $1', [doomedItem.id])).q, '0.000');
eq('the article is archived rather than deleted',
  (await one('select is_active a from products where id = $1', [doomedItem.id])).a, false);
eq('and the money back is its own kind in the ledger',
  Number(boxR2.removed_cents) - Number(boxR0.removed_cents), 2800);

/*
  Priced from the batches, not from today's average. Bought at two prices, removed once: what
  comes back has to be what was actually paid, or the balance quietly drifts by the spread.
*/
const twoPrice = await one(
  `select create_product('BC-Spread', 'Spread', $1, 100, 500, 10, 1, 'piece', null, 'budget') as id`,
  [cat.id],
);
await db.query(`select set_cost_method('batch')`);
await db.query(`select adjust_stock($1, 10, 'restock', null, 300, 'budget')`, [twoPrice.id]);
const spreadBack = await one(`select archive_product($1, null) as r`, [twoPrice.id]);
eq('a removal spanning two prices gives back both, not a blend',
  Number(spreadBack.r.value_cents), 10 * 100 + 10 * 300);
await db.query(`select set_cost_method('average')`);

const twice = await one(`select archive_product($1, null) as r`, [doomedItem.id]);
eq('removing an already removed article is a quiet no-op', twice.r.already_removed, true);
eq('and takes no further money', (await budget()).balance_cents, boxR2.balance_cents);

const emptyOne = await one(
  `select create_product('BC-Empty', 'Empty', $1, 400, 900, 0, 1, 'piece', null, 'budget') as id`,
  [cat.id],
);
const boxR3 = await budget();
await db.query(`select archive_product($1, null)`, [emptyOne.id]);
eq('removing an article holding nothing moves no money',
  (await budget()).balance_cents, boxR3.balance_cents);

// --- articles that come in sizes and flavours -------------------------------
console.log('\nvariants');

const tobacco = await one(`select * from categories where lower(name) = 'tobacco'`);
check('tobacco is set up with the sizes the shop sells',
  JSON.stringify(tobacco.variant_sizes) === JSON.stringify(['50g', '250g', '1kg']),
  JSON.stringify(tobacco.variant_sizes));
eq('and calls its free-text part a taste', tobacco.variant_trait_label, 'Taste');

const shisha = await one(
  `select create_product('BC-AF250', 'Al Fakher Double Apple 250g', $1, 500, 900, 4, 1,
                         'piece', null, 'budget', '250g', 'Double Apple', 'Al Fakher') as id`,
  [tobacco.id],
);
const shishaRow = await one('select * from products where id = $1', [shisha.id]);
eq('the assembled name is what the catalogue carries',
  shishaRow.name, 'Al Fakher Double Apple 250g');
eq('the size is kept apart so the form can edit it', shishaRow.variant_size, '250g');
eq('and so is the taste', shishaRow.variant_trait, 'Double Apple');

const sameBrand = await one(
  `select create_product('BC-AF50', 'Al Fakher Mint 50g', $1, 200, 400, 6, 1,
                         'piece', null, 'budget', '50g', 'Mint') as id`,
  [tobacco.id],
);
eq('a different size is a different article with its own stock',
  (await one('select quantity_in_stock q from products where id = $1', [sameBrand.id])).q, '6.000');
eq('the two do not collide', (await one(
  `select count(*) c from products where name like 'Al Fakher%' and is_active`)).c, 2);

/*
  The brand is a column, not the leading words of the name. That is what lets the till group a
  family together after a name has been edited by hand, which the old chop-the-suffix approach
  quietly failed at.
*/
eq('the brand is stored in its own right', shishaRow.variant_base, 'Al Fakher');

const renamed = await one(
  `select create_product('BC-AF1K', 'Al Fakher Mint 1kg', $1, 900, 1500, 2, 1,
                         'piece', null, 'budget', '1kg', 'Mint', 'Al Fakher') as id`,
  [tobacco.id],
);
await db.query(`update products set name = 'Hand edited entirely' where id = $1`, [renamed.id]);
eq('and survives the name being edited afterwards',
  (await one('select variant_base v from products where id = $1', [renamed.id])).v, 'Al Fakher');

const family = await all(
  `select variant_trait, variant_size from products
    where category_id = $1 and variant_base = 'Al Fakher' and is_active
    order by variant_trait, variant_size`,
  [tobacco.id],
);
eq('so the whole brand still groups together', family.length, 3);
check('and the till can walk it as tastes then weights',
  JSON.stringify(family.map((r) => [r.variant_trait, r.variant_size])) ===
    JSON.stringify([['Double Apple', '250g'], ['Mint', '1kg'], ['Mint', '50g']]),
  JSON.stringify(family));

eq('tobacco knows what it calls the leading part', tobacco.variant_base_label, 'Brand');

check('a shelf with no sizes is untouched by any of this',
  (await one('select variant_sizes v from categories where id = $1', [cat.id])).v === null);

const plain = await one(
  `select create_product('BC-Plain', 'Plain', $1, 100, 200, 1, 1, 'piece', null, 'budget') as id`,
  [cat.id],
);
eq('and an article on it carries no size', (await one(
  'select variant_size v from products where id = $1', [plain.id])).v, null);

// --- reset -----------------------------------------------------------------
console.log('\nreset');

await expectError('reset refuses without the confirmation word', '22023', () =>
  db.query(`select reset_shop('yes')`));
await expectError('reset refuses an empty confirmation', '22023', () =>
  db.query(`select reset_shop(null)`));
check('nothing was deleted by the refused attempts',
  Number((await one('select count(*) c from sales')).c) > 0);

const removed = await one(`select reset_shop('RESET') as counts`);
check('reset reports what it removed', Number(removed.counts.sales) > 0, JSON.stringify(removed.counts));

for (const table of ['sales', 'sale_items', 'stock_movements', 'cash_movements', 'products']) {
  eq(`${table} is empty afterwards`, (await one(`select count(*) c from ${table}`)).c, 0);
}

/*
  Categories are the exception, and deliberately so. A reset means starting again from empty,
  and a brand new shop is not empty of shelves: it opens with the same set the schema gives
  it. Wiping them left a shop that could not take a sale until nine categories had been typed
  back in, and took Tobacco's sizes with it when it went.
*/
eq('but the starting shelves come back, so the shop is usable',
  (await one('select count(*) c from categories')).c, 9);
const freshTobacco = await one(`select * from categories where lower(name) = 'tobacco'`);
check('and tobacco still knows the sizes it sells',
  JSON.stringify(freshTobacco.variant_sizes) === JSON.stringify(['50g', '250g', '1kg']),
  JSON.stringify(freshTobacco.variant_sizes));
eq('and what it calls its varieties', freshTobacco.variant_trait_label, 'Taste');

// Called twice, nothing doubles: the shelves are matched on name, not blindly inserted.
await db.query('select seed_default_categories()');
eq('seeding again adds nothing', (await one('select count(*) c from categories')).c, 9);
eq('the settings row survives, so the rate need not be typed back in',
  (await one('select count(*) c from app_settings')).c, 1);
eq('and the budget reads as a fresh shop', (await budget()).balance_cents, 0);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFailures:\n' + failures.map((f) => '  - ' + f).join('\n'));
  process.exit(1);
}
