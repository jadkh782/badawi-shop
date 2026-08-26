/**
 * Drives the app through every flow and photographs each step.
 *
 * Runs against demo mode so the screens have a stocked shop and a fortnight of trading in
 * them: a manual full of empty states teaches nobody anything. The demo banner is hidden for
 * the capture, since it is not part of what the shop will see.
 *
 * Uses the Chrome already on the machine rather than downloading one.
 *   node scripts/capture-screens.mjs
 */
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));

if (!CHROME) {
  console.error('Chrome was not found. Install it, or edit CHROME in this script.');
  process.exit(1);
}

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = 'docs/screens';
const PIN = '2307';

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--hide-scrollbars', '--force-device-scale-factor=2'],
});

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });

const shots = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Hides the demo strip, which is scaffolding rather than something the shop will see. */
async function hideDemoBanner() {
  await page.addStyleTag({
    content: `[role="status"]:has(> span[aria-hidden]) { display: none !important; }`,
  }).catch(() => undefined);
}

async function shot(name, caption) {
  await hideDemoBanner();
  await wait(320);
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file });
  shots.push({ name, caption, file });
  console.log(`  captured ${name}`);
}

/** Clicks the first button or link whose visible text matches. */
async function click(text, { exact = true } = {}) {
  const handle = await page.evaluateHandle((t, ex) => {
    const nodes = [...document.querySelectorAll('button, a')];
    return nodes.find((n) => {
      const label = (n.innerText || n.getAttribute('aria-label') || '').trim();
      return ex ? label === t : label.includes(t);
    }) ?? null;
  }, text, exact);
  const el = handle.asElement();
  if (!el) throw new Error(`Nothing to click labelled "${text}" on ${page.url()}`);
  await el.click();
  await wait(420);
}

/** Enters the PIN if the lock screen is up. A full page load always re-locks, by design. */
async function unlock() {
  const locked = await page.evaluate(() => document.body.innerText.includes('Enter your PIN'));
  if (!locked) return;
  for (const digit of PIN) await click(digit);
  await wait(700);
}

/** The empty cart offers a labelled Browse button; a filled one only has the footer icon. */
async function openBrowse() {
  const opened = await page.evaluate(() => {
    const byText = [...document.querySelectorAll('button')].find(
      (b) => b.innerText.trim() === 'Browse',
    );
    const byLabel = document.querySelector('button[aria-label="Browse items by category"]');
    const target = byText ?? byLabel;
    target?.click();
    return Boolean(target);
  });
  if (!opened) throw new Error('No way to open the product browser on ' + page.url());
  await wait(500);
}

async function goto(path, { keepLocked = false } = {}) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' });
  await wait(400);
  if (!keepLocked) await unlock();
  await wait(200);
}


// ---------------------------------------------------------------------------
// The flows, in the order a shop meets them.
// ---------------------------------------------------------------------------
console.log('\nCapturing screens...\n');

// --- Unlocking -------------------------------------------------------------
await goto('/', { keepLocked: true });
await shot('01-lock', 'The PIN screen, every time the app is opened.');

await unlock();
await shot('02-home', 'Home: the two modes, the rate, and the day so far.');

// --- Selling ---------------------------------------------------------------
await goto('/sell/');
await shot('03-sell-empty', 'Sell mode before anything is scanned.');

await openBrowse();
await shot('04-sell-browse', 'Browsing by category, for items with no barcode.');

await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  [...d.querySelectorAll('button.card')].find((c) => c.innerText.includes('Coca Cola'))?.click();
});
await wait(500);

// A second and third item, so the cart shows more than one line.
for (const name of ['Oreo', 'Arabic bread']) {
  await openBrowse();
  await page.evaluate((n) => {
    const d = document.querySelector('[role="dialog"]');
    [...d.querySelectorAll('button.card')].find((c) => c.innerText.includes(n))?.click();
  }, name);
  await wait(500);
}

// Bump the first line so the stepper is doing something visible.
await page.evaluate(() => {
  const inc = document.querySelectorAll('button[aria-label="One more"]');
  inc[0]?.click();
  inc[0]?.click();
});
await wait(400);
await shot('05-sell-cart', 'Three items in the cart, with the running total in both currencies.');

await click('Check out');
await shot('06-checkout', 'The checkout sheet: subtotal, discount, total, and how it was paid.');

await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  [...d.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Percent')?.click();
});
await wait(500);
await shot('07-checkout-discount', 'A ten percent discount, previewed live in both currencies.');

await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  [...d.querySelectorAll('button')].find((b) => b.innerText.startsWith('Take'))?.click();
});
await wait(1200);
await shot('08-sale-done', 'The sale is recorded. Enter what the customer handed over for change.');

console.log('\nsell flow done');

// --- Inventory -------------------------------------------------------------
await goto('/inventory/');
await shot('09-inventory', 'Inventory: everything on the shelves, with stock counts.');

await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Running low')?.click();
});
await wait(600);
await shot('10-inventory-low', 'Filtered to what needs reordering.');

await goto('/inventory/new/');
await page.evaluate(() => {
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (!el) return;
    const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    s.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  set('barcode', '5449000214911');
  set('name', 'Sprite 1L');
  set('cost', '0.55');
  set('price', '1.20');
  set('quantity', '24');
});
await wait(500);
await shot('11-inventory-new', 'Adding an article. The margin is worked out as you type.');

await goto('/inventory/');
await page.evaluate(() => {
  document.querySelector('main li a')?.click();
});
await wait(900);
await shot('12-inventory-item', 'An article, with its stock level and the Restock button.');

await click('Restock');
await shot('13-restock', 'Restocking: a delivery adds, a correction sets the true count.');

await goto('/inventory/categories/');
await shot('14-categories', 'Categories, which are also how no-barcode items are sold.');

// --- Reports ---------------------------------------------------------------
await goto('/reports/');
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'This month')?.click();
});
await wait(1400);
await shot('15-reports', 'Reports for a period: the trend, takings and profit.');

await page.evaluate(() => window.scrollTo(0, 620));
await wait(500);
await shot('16-reports-figures', 'The figures: profit, margin, average basket, cash per currency.');

await page.evaluate(() => window.scrollTo(0, 1500));
await wait(500);
await shot('17-reports-sellers', 'Best sellers, sales by category, and what needs restocking.');

// --- Settings --------------------------------------------------------------
await goto('/settings/');
await shot('18-settings', 'Settings: the exchange rate every pound figure comes from.');

await page.evaluate(() => window.scrollTo(0, 700));
await wait(400);
await shot('19-settings-lock', 'The screen lock, where the PIN is changed or turned off.');

// --- Desktop ---------------------------------------------------------------
await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 2 });
await goto('/reports/');
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'This month')?.click();
});
await wait(1400);
await shot('20-desktop', 'The same app on a computer, with the modes in a rail down the left.');

await browser.close();

console.log(`\n${shots.length} screens captured into ${OUT}\n`);
