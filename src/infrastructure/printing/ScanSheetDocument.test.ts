import { describe, expect, it } from 'vitest';
import { ScanSheetDocument, type ScanSheetItem } from './ScanSheetDocument';

const item = (over: Partial<ScanSheetItem> = {}): ScanSheetItem => ({
  name: 'FAKHER ENAB 50G',
  barcode: '2012345678909',
  price_cents: 133,
  category: 'M3ASAL',
  ...over,
});

const sheet = (items: ScanSheetItem[]) =>
  ScanSheetDocument.build({
    shop_name: 'BEIT BADAWI',
    printed_at: '2026-11-17T09:00:00',
    items,
  });

describe('a sheet to scan from', () => {
  it('is A4, not a receipt roll', () => {
    // The whole point of it: an 80mm roll cannot hold a grid.
    expect(sheet([item()])).toContain('size: A4');
  });

  it('carries the name, price and a barcode for each article', () => {
    const html = sheet([item()]);
    expect(html).toContain('FAKHER ENAB 50G');
    expect(html).toContain('$1.33');
    expect(html).toContain('<svg');
  });

  it('groups by shelf, because that is how someone looks for one', () => {
    const html = sheet([
      item({ name: 'A', category: 'FAHEM', barcode: '2012345678909' }),
      item({ name: 'B', category: 'M3ASAL', barcode: '2034981127775' }),
      item({ name: 'C', category: 'FAHEM', barcode: '2012345678909' }),
    ]);
    expect(html).toContain('FAHEM');
    expect(html).toContain('M3ASAL');
    // Shelves in alphabetical order, so the same sheet reprints the same way.
    expect(html.indexOf('FAHEM')).toBeLessThan(html.indexOf('M3ASAL'));
  });

  it('counts what is on each shelf', () => {
    const html = sheet([
      item({ name: 'A', category: 'FAHEM' }),
      item({ name: 'B', category: 'FAHEM' }),
    ]);
    expect(html).toContain('<span class="count">2</span>');
  });

  it('says how many articles in total', () => {
    const html = sheet([item({ name: 'A' }), item({ name: 'B' }), item({ name: 'C' })]);
    expect(html).toContain('3 articles');
    expect(html).toContain('17/11/2026');
  });

  it('leaves out an article with nothing to scan', () => {
    // A cell with no barcode is a cell that cannot do the one job this sheet has.
    const html = sheet([item({ name: 'Scannable' }), item({ name: 'Bare', barcode: '' })]);
    expect(html).toContain('Scannable');
    expect(html).not.toContain('Bare');
  });

  it('says so rather than printing a blank page when nothing can be scanned', () => {
    const html = sheet([item({ barcode: '' })]);
    expect(html).toContain('No article here has a barcode');
    expect(html).not.toContain('<svg');
  });
});

describe('making sure it actually scans', () => {
  it('never lets a barcode straddle a page break', () => {
    // Half a barcode on each of two pages is two barcodes that do not scan.
    const html = sheet([item()]);
    expect(html).toContain('break-inside: avoid');
    expect(html).toContain('page-break-inside: avoid');
  });

  it('keeps a shelf heading with the shelf it names', () => {
    expect(sheet([item()])).toContain('page-break-after: avoid');
  });

  it('lays out three across, not as many as will fit', () => {
    // A crowded sheet is how a handheld scanner reads the article next to the one meant.
    expect(sheet([item()])).toContain('repeat(3, 1fr)');
  });

  it('falls back to Code 39 for a code that is not an EAN-13', () => {
    const html = sheet([item({ barcode: 'ABC123' })]);
    expect(html).toContain('<svg');
    expect(html).toContain('ABC123');
  });

  it('escapes an article name rather than letting it reshape the sheet', () => {
    const html = sheet([item({ name: '<b>x</b>' })]);
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });

  it('prints black on white whatever the app looks like', () => {
    const html = sheet([item()]);
    expect(html).toContain('background: #fff');
    expect(html).not.toContain('var(--color-');
  });
});
