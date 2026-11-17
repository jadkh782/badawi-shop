import { describe, expect, it } from 'vitest';
import { ReceiptDocument } from './ReceiptDocument';
import type { ReceiptPayload } from './receiptTypes';

function payload(over: Partial<ReceiptPayload> = {}): ReceiptPayload {
  return {
    kind: 'sale',
    shop_name: 'Beit Badawi',
    shop_phone: '01 234 567',
    shop_address: 'Main Street',
    footer: 'Thank you',
    sale_id: 'a1b2c3d4-0000-0000-0000-000000000000',
    sold_at: '2026-09-15T14:32:00.000Z',
    printed_at: '2026-11-17T09:00:00.000Z',
    is_reprint: false,
    is_voided: false,
    lines: [
      {
        name: 'FAKHER ENAB 50G',
        quantity: 2,
        unit: 'piece',
        unit_price_cents: 133,
        line_total_cents: 266,
      },
    ],
    subtotal_cents: 266,
    discount_label: null,
    discount_cents: 0,
    total_cents: 266,
    total_lbp: 239000,
    usd_to_lbp_rate: 90000,
    payment_currency: 'USD',
    item_count: 2,
    note: null,
    ...over,
  };
}

describe('a printed receipt', () => {
  it('shows the shop, the article and what was paid', () => {
    const html = ReceiptDocument.receipt(payload());
    expect(html).toContain('Beit Badawi');
    expect(html).toContain('01 234 567');
    expect(html).toContain('Main Street');
    expect(html).toContain('FAKHER ENAB 50G');
    expect(html).toContain('$2.66');
    expect(html).toContain('239,000 L.L.');
    expect(html).toContain('Thank you');
  });

  it('shows the sale number the rest of the app shows', () => {
    const html = ReceiptDocument.receipt(payload());
    expect(html).toContain('A1B2C3D4');
  });

  it('leaves out lines the shop has not filled in', () => {
    const html = ReceiptDocument.receipt(
      payload({ shop_phone: null, shop_address: null, footer: null }),
    );
    expect(html).not.toContain('01 234 567');
    expect(html).not.toContain('Main Street');
    expect(html).not.toContain('Thank you');
    // And still prints the rest rather than falling over on the missing pieces.
    expect(html).toContain('Beit Badawi');
    expect(html).toContain('$2.66');
  });

  it('names the discount the cashier chose, and takes it off', () => {
    const html = ReceiptDocument.receipt(
      payload({ discount_label: '10% off', discount_cents: 27, total_cents: 239 }),
    );
    expect(html).toContain('10% off');
    expect(html).toContain('-$0.27');
    expect(html).toContain('$2.39');
  });
});

describe('the rate a reprint uses', () => {
  /*
    The trap this guards. The rate moves, and useSettings() holds today's. A receipt
    reprinted months later must show the pounds the customer actually handed over, which is
    the figure frozen onto the sale, not one worked out now. The rounding step is not even
    stored on the sale, so recomputing could not reproduce it faithfully even if it tried.
  */
  it('prints the pound total frozen onto the sale, whatever the rate is now', () => {
    const html = ReceiptDocument.receipt(
      payload({ total_lbp: 239000, usd_to_lbp_rate: 90000 }),
    );
    expect(html).toContain('239,000 L.L.');
    expect(html).toContain('$1 = 90,000 L.L.');
  });

  it('does not recompute pounds from the dollar total', () => {
    // Same dollars, a rate the shop has since moved away from. If anything multiplied
    // total_cents by a live rate, this figure would not survive.
    const html = ReceiptDocument.receipt(
      payload({ total_cents: 266, total_lbp: 119000, usd_to_lbp_rate: 45000 }),
    );
    expect(html).toContain('119,000 L.L.');
    expect(html).not.toContain('239,000 L.L.');
  });

  it('prints no pound figure per line, because none was ever recorded', () => {
    // Lines derived at a live rate would stop adding up to the frozen total.
    const html = ReceiptDocument.receipt(payload());
    expect(html.match(/L\.L\./g)).toHaveLength(2); // the total, and the rate line
  });
});

describe('what a customer must never be handed', () => {
  /*
    A Sale carries unitCost, lineCost, lineProfit, totalCost and profit. The payload has
    nowhere to put them, and this is the test that says so out loud: if anyone widens the
    DTO to take a domain object wholesale, this fails rather than the shop finding out from
    a customer holding a slip that says what the margin was.
  */
  it('has no field for cost or profit at all', () => {
    const keys = Object.keys(payload());
    for (const forbidden of ['cost', 'profit', 'margin']) {
      expect(keys.filter((key) => key.includes(forbidden))).toEqual([]);
    }
    const lineKeys = Object.keys(payload().lines[0]!);
    for (const forbidden of ['cost', 'profit', 'margin']) {
      expect(lineKeys.filter((key) => key.includes(forbidden))).toEqual([]);
    }
  });

  it('prints no cost figure even when one is smuggled onto the payload', () => {
    const smuggled = {
      ...payload(),
      // What a careless spread of a domain Sale would drag in. $0.60 a unit, $1.20 a line.
      unit_cost_cents: 60,
      line_cost_cents: 120,
      profit_cents: 146,
    } as unknown as ReceiptPayload;

    const html = ReceiptDocument.receipt(smuggled);
    expect(html).not.toContain('$0.60');
    expect(html).not.toContain('$1.20');
    expect(html).not.toContain('$1.46');
  });
});

describe('a slip that is not an ordinary sale', () => {
  it('stamps a reprint, so an old copy is not passed off as the original', () => {
    const html = ReceiptDocument.receipt(payload({ is_reprint: true }));
    expect(html).toContain('REPRINT');
    expect(html).toContain('Printed 17/11/2026');
  });

  it('stamps a voided sale rather than printing it as live', () => {
    const html = ReceiptDocument.receipt(payload({ is_voided: true, is_reprint: true }));
    expect(html).toContain('VOIDED');
    // One stamp, not two competing ones.
    expect(html).not.toContain('REPRINT');
  });

  it('reads as money going back on a refund', () => {
    const html = ReceiptDocument.receipt(payload({ kind: 'refund' }));
    expect(html).toContain('REFUND');
    expect(html).toContain('REFUNDED');
    expect(html).toContain('-$2.66');
  });
});

describe('the document itself', () => {
  it('is sized for the 72mm printable area of an 80mm roll', () => {
    // 72mm is the XP-80T's stated print width inside a 79.5mm roll.
    const html = ReceiptDocument.receipt(payload());
    expect(html).toContain('width: 72mm');
    expect(html).toContain('margin: 0');
  });

  it('never writes a page size mixing a length with auto', () => {
    /*
      The bug this exists for. "size: 72mm auto" reads like "this wide, as long as it needs
      to be" and is invalid CSS — size takes auto, or one or two lengths, never both. The
      browser discards the whole rule, the page falls back to the driver's paper length, and
      a short receipt comes out on two feet of paper.
    */
    const html = ReceiptDocument.receipt(payload());
    expect(html).not.toMatch(/size:\s*[\d.]+(mm|cm|in|px)\s+auto/);
    expect(html).not.toMatch(/size:\s*auto\s+[\d.]+(mm|cm|in|px)/);
  });

  it('prints black on white, whatever the app looks like', () => {
    // The app is dark-themed. A dark receipt would try to render as solid black ink.
    const html = ReceiptDocument.receipt(payload());
    expect(html).toContain('background: #fff');
    expect(html).toContain('color: #000');
    expect(html).not.toContain('var(--color-');
  });

  it('escapes an article name rather than letting it reshape the page', () => {
    const html = ReceiptDocument.receipt(
      payload({
        lines: [
          {
            name: '<b>Trouble</b> & "co"',
            quantity: 1,
            unit: 'piece',
            unit_price_cents: 100,
            line_total_cents: 100,
          },
        ],
      }),
    );
    expect(html).toContain('&lt;b&gt;Trouble&lt;/b&gt; &amp; &quot;co&quot;');
    expect(html).not.toContain('<b>Trouble</b>');
  });

  it('names a unit only when it is not just a piece', () => {
    const grams = ReceiptDocument.receipt(
      payload({
        lines: [
          { name: 'Fahem', quantity: 1.5, unit: 'kg', unit_price_cents: 400, line_total_cents: 600 },
        ],
      }),
    );
    expect(grams).toContain('1.5 kg');
    expect(ReceiptDocument.receipt(payload())).not.toContain('piece');
  });
});

describe('a shelf label', () => {
  it('carries the article, its price and a scannable code', () => {
    const html = ReceiptDocument.label({
      shop_name: 'Beit Badawi',
      product_name: 'FAKHER ENAB 50G',
      barcode: '2012345678909',
      price_cents: 133,
      price_lbp: 120000,
    });
    expect(html).toContain('FAKHER ENAB 50G');
    expect(html).toContain('$1.33');
    expect(html).toContain('120,000 L.L.');
    expect(html).toContain('<svg');
  });

  it('prints a run of them as one job, cut between each', () => {
    const html = ReceiptDocument.labels([
      { shop_name: 'S', product_name: 'One', barcode: '2012345678909', price_cents: 100, price_lbp: null },
      { shop_name: 'S', product_name: 'Two', barcode: '2034981127775', price_cents: 200, price_lbp: null },
      { shop_name: 'S', product_name: 'Three', barcode: null, price_cents: 300, price_lbp: null },
    ]);
    expect(html).toContain('One');
    expect(html).toContain('Two');
    expect(html).toContain('Three');
    // A break after every label but the last, so the printer feeds and cuts between them
    // instead of running them into one unreadable ribbon.
    expect(html.match(/page-break-after:always/g)).toHaveLength(2);
  });

  it('is one document, not several', () => {
    const html = ReceiptDocument.labels([
      { shop_name: 'S', product_name: 'One', barcode: null, price_cents: 100, price_lbp: null },
      { shop_name: 'S', product_name: 'Two', barcode: null, price_cents: 200, price_lbp: null },
    ]);
    expect(html.match(/<!doctype html>/gi)).toHaveLength(1);
    expect(html).toContain('<title>2 labels</title>');
  });

  it('says so plainly when an article has no barcode yet', () => {
    const html = ReceiptDocument.label({
      shop_name: 'Beit Badawi',
      product_name: 'Loose tea',
      barcode: null,
      price_cents: 500,
      price_lbp: null,
    });
    expect(html).toContain('No barcode');
    expect(html).not.toContain('<svg');
  });

  it('still prints a code that is not a valid EAN-13', () => {
    // An older article may carry a supplier code of any shape. Falling back beats refusing.
    const html = ReceiptDocument.label({
      shop_name: 'Beit Badawi',
      product_name: 'Odd one',
      barcode: 'ABC123',
      price_cents: 500,
      price_lbp: null,
    });
    expect(html).toContain('<svg');
  });
});
