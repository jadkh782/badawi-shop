import { Money } from '@/domain';
import { code39Svg, ean13Svg } from './barcodeSvg';
import type { LabelPayload, ReceiptPayload } from './receiptTypes';

/**
 * A receipt, as an HTML document for the printer driver to render.
 *
 * HTML rather than raw ESC/POS, because the shop's printer is reached through its Windows
 * driver: raw bytes would mean replacing that driver with WinUSB on every till, which
 * removes the printer from the normal print queue and leaves the phone with no way to print
 * at all. The driver renders this, and the desktop app will later render the very same
 * string silently, so the receipt is written once and printed two ways.
 *
 * Pure in, pure out: a payload goes in and a string comes out, with no DOM and no device.
 * That is what makes it testable, which matters more here than usual — a receipt is the one
 * screen in the shop whose mistakes leave the building with a customer.
 */
/** Printable width of 80mm paper once the margins the mechanism needs are taken off. */
const WIDTH_MM = 72;

export class ReceiptDocument {
  static receipt(payload: ReceiptPayload): string {
    const refund = payload.kind === 'refund';
    const sign = refund ? -1 : 1;

    const stamps = [
      payload.is_voided ? 'VOIDED' : null,
      payload.is_reprint && !payload.is_voided ? 'REPRINT' : null,
      refund ? 'REFUND' : null,
    ].filter(Boolean) as string[];

    const body = [
      head(payload),
      stamps.map((stamp) => `<div class="stamp">${escape(stamp)}</div>`).join(''),
      rule(),
      `<div class="row"><span>${escape(when(payload.sold_at))}</span></div>`,
      `<div class="row"><span>Sale ${escape(shortId(payload.sale_id))}</span></div>`,
      payload.is_reprint
        ? `<div class="muted">Printed ${escape(when(payload.printed_at))}</div>`
        : '',
      rule(),

      payload.lines
        .map(
          (line) => `
            <div class="item">${escape(line.name)}</div>
            <div class="row">
              <span class="muted">${count(line.quantity)}${unitOf(line)} &times; ${cents(
                line.unit_price_cents,
              )}</span>
              <span>${cents(line.line_total_cents * sign)}</span>
            </div>`,
        )
        .join(''),

      rule(),
      row('Subtotal', cents(payload.subtotal_cents * sign)),
      payload.discount_label
        ? row(escape(payload.discount_label), cents(-payload.discount_cents * sign))
        : '',
      `<div class="row total"><span>${refund ? 'REFUNDED' : 'TOTAL'}</span><span>${cents(
        payload.total_cents * sign,
      )}</span></div>`,
      `<div class="row lbp"><span></span><span>${lbp(payload.total_lbp * sign)}</span></div>`,
      rule(),

      `<div class="muted">Paid in ${escape(payload.payment_currency)}</div>`,
      `<div class="muted">$1 = ${lbp(payload.usd_to_lbp_rate)}</div>`,
      payload.note ? `<div class="muted">${escape(payload.note)}</div>` : '',

      // The sale number as something a scanner can read, so a customer coming back with a
      // receipt is found by scanning it rather than by typing eight characters of hex.
      `<div class="code">${code39Svg(shortId(payload.sale_id), { height: 40 })}</div>`,

      payload.footer ? `<div class="footer">${escape(payload.footer)}</div>` : '',
    ].join('');

    return wrap(`Receipt ${shortId(payload.sale_id)}`, body);
  }

  /**
   * A shelf ticket for one article.
   *
   * On a receipt printer this comes out as a strip of paper to cut and put on the shelf
   * edge, not an adhesive label — that is a different machine. It is still the quickest way
   * to get a generated barcode somewhere a scanner can reach it.
   */
  static label(payload: LabelPayload): string {
    return ReceiptDocument.labels([payload]);
  }

  /**
   * A run of labels as one job.
   *
   * After a stocktake there may be thirty articles needing a ticket, and thirty separate
   * print jobs is thirty chances for one to go missing in the queue. Each label breaks to
   * its own page, which is what makes the printer feed and cut between them instead of
   * running them together into an unreadable ribbon.
   */
  static labels(payloads: readonly LabelPayload[]): string {
    const body = payloads
      .map((payload, index) => {
        const last = index === payloads.length - 1;
        return `<div class="label"${last ? '' : ' style="page-break-after:always"'}>${oneLabel(
          payload,
        )}</div>`;
      })
      .join('');

    const title =
      payloads.length === 1
        ? `Label ${payloads[0]?.product_name ?? ''}`
        : `${payloads.length} labels`;
    return wrap(title, body);
  }
}

function oneLabel(payload: LabelPayload): string {
  {
    const body = [
      `<div class="shop small">${escape(payload.shop_name)}</div>`,
      `<div class="item big">${escape(payload.product_name)}</div>`,
      `<div class="price">${cents(payload.price_cents)}</div>`,
      payload.price_lbp === null
        ? ''
        : `<div class="muted center">${lbp(payload.price_lbp)}</div>`,
      payload.barcode
        ? `<div class="code">${barcodeFor(payload.barcode)}</div>`
        : '<div class="muted center">No barcode</div>',
    ].join('');

    return body;
  }
}

/** EAN-13 where the code is one, Code 39 otherwise, so any code still prints something. */
function barcodeFor(code: string): string {
  try {
    return ean13Svg(code, { height: 55 });
  } catch {
    return code39Svg(code, { height: 45 });
  }
}

function head(payload: ReceiptPayload): string {
  return [
    `<div class="shop">${escape(payload.shop_name)}</div>`,
    payload.shop_phone ? `<div class="center">${escape(payload.shop_phone)}</div>` : '',
    payload.shop_address ? `<div class="center">${escape(payload.shop_address)}</div>` : '',
  ].join('');
}

function row(label: string, value: string): string {
  return `<div class="row"><span>${label}</span><span>${value}</span></div>`;
}

function rule(): string {
  return '<div class="rule"></div>';
}

function cents(value: number): string {
  return Money.fromCents(Math.round(value)).format();
}

function lbp(value: number): string {
  return `${Math.round(value).toLocaleString('en-US')} L.L.`;
}

function count(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function unitOf(line: { unit: string }): string {
  return line.unit && line.unit !== 'piece' ? ` ${escape(line.unit)}` : '';
}

/** The eight characters the rest of the app already shows, so the two agree. */
function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * A product name is shop-entered text and goes straight into a document, so it is escaped.
 * An article called `<b>` would otherwise quietly reshape the receipt around it.
 */
function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The page itself.
 *
 * Black on white and nothing else: the app is dark-themed, and a dark background sent to a
 * thermal printer is a receipt that burns through a roll to print a black rectangle.
 */
function wrap(title: string, body: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escape(title)}</title>
<style>
  /*
    No size here, only the margin. "72mm auto" looks like it should mean "this wide, as long
    as it needs to be", and it is not valid CSS: size takes auto, or one or two lengths, and
    mixing the two makes the browser throw the whole rule away. The page then fell back to
    the driver's own paper length, which on a receipt printer is enormous, and a short
    receipt came out on two feet of paper.

    So the width is set on the body instead, and how long the page is left to the printer:
    the till app measures the finished receipt and tells the printer exactly, and a browser
    uses whatever the chosen printer's paper is set to.
  */
  @page { margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
  }
  body {
    width: ${WIDTH_MM}mm;
    padding: 3mm 2mm 6mm;
    font-family: "Courier New", ui-monospace, monospace;
    font-size: 12px;
    line-height: 1.35;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .shop { text-align: center; font-size: 17px; font-weight: 700; letter-spacing: .5px; }
  .shop.small { font-size: 13px; font-weight: 700; }
  .center { text-align: center; }
  .muted { color: #000; font-size: 11px; }
  .muted.center { text-align: center; }
  .rule { border-top: 1px dashed #000; margin: 4px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .row span:last-child { white-space: nowrap; }
  .item { font-weight: 700; word-break: break-word; }
  .item.big { font-size: 15px; text-align: center; margin-top: 2mm; }
  .total { font-size: 15px; font-weight: 700; margin-top: 2px; }
  .lbp { font-size: 12px; }
  .price { text-align: center; font-size: 20px; font-weight: 700; margin: 1mm 0; }
  .stamp {
    margin: 2mm auto 0;
    padding: 1px 6px;
    border: 2px solid #000;
    font-weight: 700;
    letter-spacing: 2px;
    text-align: center;
    width: fit-content;
  }
  .code { margin: 3mm 0 0; text-align: center; }
  .code svg { max-width: 100%; height: auto; }
  .label { padding-bottom: 4mm; }
  .footer { margin-top: 3mm; text-align: center; white-space: pre-wrap; }
</style>
</head>
<body>${body}</body>
</html>`;
}
