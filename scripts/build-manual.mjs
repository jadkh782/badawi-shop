/**
 * Turns the screenshots and the copy into a printed manual.
 *
 * Rendered through the Chrome already on the machine rather than a PDF library, because the
 * document is mostly pictures and the layout matters: a library would make the paging and the
 * typography my problem for no benefit.
 *
 *   node scripts/build-manual.mjs
 */
import puppeteer from 'puppeteer-core';
import { writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { sections, SHOP } from './manual-content.mjs';
import { css } from './manual-style.mjs';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));

if (!CHROME) {
  console.error('Chrome was not found.');
  process.exit(1);
}

const SHOTS = 'docs/screens';

/** Images are inlined so the PDF never depends on files sitting next to it. */
async function inline(file) {
  const full = path.join(SHOTS, file);
  if (!existsSync(full)) throw new Error(`Missing screenshot: ${full}`);
  const data = await readFile(full);
  return `data:image/png;base64,${data.toString('base64')}`;
}

const today = new Date().toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const escape = (s) => s.replace(/&(?![a-z]+;|#)/g, '&amp;');

let body = `
<div class="cover">
  <div class="mark">
    ${[3, 1, 1, 2, 4, 1, 2, 1, 3, 1, 1, 2, 2, 3]
      .map((w) => `<i style="width:${w * 2.2}mm"></i>`)
      .join('')}
  </div>
  <h1>${SHOP}</h1>
  <div class="sub">Till and stock &mdash; how to use it</div>
  <div class="rule"></div>
  <div class="meta">Screen by screen &middot; ${today}</div>
</div>

<div class="toc">
  <h2>What is in here</h2>
  <ol>
    ${sections
      .map((s) => `<li><span class="t">${s.title}</span><span class="d">${escape(s.blurb)}</span></li>`)
      .join('')}
    <li><span class="t">If something is not right</span><span class="d">The three things most likely to go wrong, and what to do.</span></li>
  </ol>
</div>
`;

for (const section of sections) {
  const screens = [];
  for (const screen of section.screens) {
    const src = await inline(screen.img);
    const wide = screen.img.startsWith('20-');
    screens.push(`
      <div class="screen${wide ? ' wide' : ''}">
        <img src="${src}" alt="${screen.title}">
        <div>
          <h3>${screen.title}</h3>
          <ol>${screen.steps.map((s) => `<li>${escape(s)}</li>`).join('')}</ol>
          ${screen.note ? `<p class="note">${escape(screen.note)}</p>` : ''}
        </div>
      </div>`);
  }

  body += `
    <div class="section">
      <div class="section-head">
        <div class="eyebrow">${section.id}</div>
        <h2>${section.title}</h2>
        <p>${escape(section.blurb)}</p>
      </div>
      ${screens.join('')}
    </div>`;
}

body += `
<div class="trouble">
  <h2>If something is not right</h2>
  <dl>
    <dt>The scanner beeps but says the item is not in inventory</dt>
    <dd>That barcode has not been added yet. Tap <b>Add it now</b> on the prompt: it carries the
    barcode across, so only the name and prices need typing. You come straight back to the sale.</dd>

    <dt>An item will not go in the cart</dt>
    <dd>The shelf is empty. Open Inventory, find the item and use <b>Restock</b>. The till refuses
    to sell what is not there rather than letting the count drift.</dd>

    <dt>Nothing loads, or the figures are all zero</dt>
    <dd>The phone has no connection. The app keeps its stock and its sales online so the phone and
    the computer always agree, which means it needs a signal to work. It will say so on screen.</dd>

    <dt>The exported file cannot be found</dt>
    <dd>It is in the phone's <b>Documents</b> folder, and the sharing menu opens as soon as it is
    made. The message on screen names the file.</dd>

    <dt>A price was entered wrongly and things have already been sold</dt>
    <dd>Fix the price in Inventory. Sales already taken keep the price they were sold at, so past
    figures do not move. Only sales from now on use the new one.</dd>
  </dl>
</div>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${SHOP} — how to use it</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Instrument+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>${body}</body>
</html>`;

await writeFile('docs/manual.html', html);
console.log('wrote docs/manual.html');

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle0' });
// Give the webfonts a moment; printing before they land loses the whole type treatment.
await page.evaluateHandle('document.fonts.ready');

await page.pdf({
  path: 'docs/Badawi-Shop-User-Guide.pdf',
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
});

await browser.close();
console.log('wrote docs/Badawi-Shop-User-Guide.pdf');
