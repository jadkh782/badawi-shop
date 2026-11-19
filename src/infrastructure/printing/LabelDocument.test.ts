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
  it('states the page in millimetres, so nothing has to guess it', () => {
    /*
      A document that declares no size has to be laid out against something, and that
      something is not the label: the content came out magnified, a corner of the barcode on
      the paper and the rest off the edge. So the real figures are stated here, and they are
      the ones a ruler gives for the roll — fifty-eight by thirty, not the fifty by thirty
      this stock is commonly sold as.
    */
    const html = LabelDocument.build([item()]);
    expect(html).toContain('size: 58mm 30mm');
    expect(html).toContain('width: 58mm');
  });

  it('still knows the stock it was designed around', () => {
    // Kept for the on-screen copy that tells the shop what to set the driver to.
    expect(LABEL_WIDTH_MM).toBe(58);
    expect(LABEL_HEIGHT_MM).toBe(30);
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

describe('fitting whatever page it is given', () => {
  it('caps its height instead of pinning it, so it cannot split across two labels', () => {
    // Pinning the box to the full page height is what put content half on one label and
    // half on the next; capping it lets a short label stay short.
    const html = LabelDocument.build([item()]);
    expect(html).toContain('max-height: 30mm');
    expect(html).not.toMatch(/\.label\s*\{[^}]*[^-]height:\s*30mm/);
  });

  it('keeps clear of the edges the driver reserves', () => {
    // The exposed liner setting alone can take two millimetres a side.
    expect(LabelDocument.build([item()])).toContain('padding: 1.2mm 2mm');
  });

  it('does not clip at the root, which prints blank paper', () => {
    const html = LabelDocument.build([item()]);
    expect(html).not.toMatch(/html,\s*body\s*\{[^}]*overflow:\s*hidden/);
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
