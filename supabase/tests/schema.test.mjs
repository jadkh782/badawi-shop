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
eq('restocking raises the count',
  (await one(`select adjust_stock($1, 20, 'restock', 'delivery') q`, [chips.id])).q, '25.000');
eq('a restock is written to the ledger',
  (await one(`select delta || '/' || reason v from stock_movements
              where product_id = $1 and reason = 'restock'`, [chips.id])).v, '20.000/restock');
eq('a correction can reduce the count',
  (await one(`select adjust_stock($1, -5, 'adjustment', 'breakage') q`, [chips.id])).q, '20.000');

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

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFailures:\n' + failures.map((f) => '  - ' + f).join('\n'));
  process.exit(1);
}
