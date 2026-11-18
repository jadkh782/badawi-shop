import { describe, expect, it } from 'vitest';
import { LABEL_HEIGHT_MM, LABEL_WIDTH_MM, LabelDocument, type LabelItem } from './LabelDocument';

const item = (over: Partial<LabelItem> = {}): LabelItem => ({
  name: 'FAKHER ENAB 50G',
  barcode: '2012345678909',
  price_cents: 133,
  copies: 1,
  ...over,
});

describe('a shelf label', () => {
  it('is cut to the stock the shop runs', () => {
    // 50 x 30mm die-cut. A page even slightly off walks down the roll and lands on the gap.
    expect(LABEL_WIDTH_MM).toBe(50);
    expect(LABEL_HEIGHT_MM).toBe(30);
    expect(LabelDocument.build([item()])).toContain('size: 50mm 30mm');
  });

  it('carries the name, the price and the barcode', () => {
    const html = LabelDocument.build([item()]);
    expect(html).toContain('FAKHER ENAB 50G');
    expect(html).toContain('$1.33');
    expect(html).toContain('<svg');
  });

  it('prints black on white, whatever the app looks like', () => {
    const html = LabelDocument.build([item()]);
    expect(html).toContain('background: #fff');
    expect(html).not.toContain('var(--color-');
  });

  it('escapes a name rather than letting it reshape the label', () => {
    const html = LabelDocument.build([item({ name: '<b>x</b>' })]);
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });
});

describe('fitting the page without spilling over it', () => {
  it('leaves the label box a hair under the page', () => {
    /*
      The bug this exists for. The box was exactly 50x30 on a 50x30 page, and a driver whose
      printable area rounded down by a fraction pushed the content onto a second page: one
      blank label out of the printer, one printed.
    */
    const html = LabelDocument.build([item()]);
    expect(html).toContain('size: 50mm 30mm');
    expect(html).toContain(`height: ${LABEL_HEIGHT_MM - 0.6}mm`);
    expect(html).not.toContain(`height: ${LABEL_HEIGHT_MM}mm;`);
  });

  it('clips anything that would still reach past the page', () => {
    expect(LabelDocument.build([item()])).toContain('overflow: hidden');
  });
});

describe('how many come out', () => {
  it('prints one page per copy, so the printer advances one label each', () => {
    const html = LabelDocument.build([item({ copies: 3 })]);
    // Three labels, two breaks between them.
    expect(html.match(/class="label"/g)).toHaveLength(3);
    expect(html.match(/page-break-after:always/g)).toHaveLength(2);
  });

  it('counts a run before it is printed', () => {
    expect(LabelDocument.count([item({ copies: 6 }), item({ copies: 4 })])).toBe(10);
  });

  it('never prints less than one of anything', () => {
    // A shelf holding nothing still wants a label when the shop asks for one.
    expect(LabelDocument.count([item({ copies: 0 })])).toBe(1);
    expect(LabelDocument.count([item({ copies: -5 })])).toBe(1);
    expect(LabelDocument.build([item({ copies: 0 })]).match(/class="label"/g)).toHaveLength(1);
  });

  it('rounds a fractional count down to whole labels', () => {
    // Stock can be fractional for goods sold by weight; labels cannot.
    expect(LabelDocument.count([item({ copies: 2.7 })])).toBe(2);
  });

  it('keeps several articles in one job', () => {
    const html = LabelDocument.build([
      item({ name: 'One', copies: 2 }),
      item({ name: 'Two', copies: 1 }),
    ]);
    expect(html).toContain('One');
    expect(html).toContain('Two');
    expect(html.match(/class="label"/g)).toHaveLength(3);
    expect(html.match(/<!doctype html>/gi)).toHaveLength(1);
  });

  it('says so rather than printing a blank label when there is nothing', () => {
    expect(LabelDocument.build([])).toContain('Nothing to print');
  });
});

describe('making sure the barcode survives the squeeze', () => {
  it('clamps a long name to two lines so it cannot push the barcode off', () => {
    // The name is the part that can be shortened; the barcode is the part that cannot.
    const html = LabelDocument.build([item({ name: 'A very long article name '.repeat(6) })]);
    expect(html).toContain('-webkit-line-clamp: 2');
    expect(html).toContain('overflow: hidden');
  });

  it('falls back to Code 39 for a code that is not an EAN-13', () => {
    expect(LabelDocument.build([item({ barcode: 'ABC123' })])).toContain('<svg');
  });

  it('leaves the barcode out when there is none, without breaking the label', () => {
    const html = LabelDocument.build([item({ barcode: null })]);
    expect(html).toContain('FAKHER ENAB 50G');
    expect(html).not.toContain('<svg');
  });
});
