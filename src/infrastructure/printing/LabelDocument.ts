import { Money } from '@/domain';
import { code39Svg, ean13Svg } from './barcodeSvg';

/**
 * The die-cut label stock the shop runs in the label printer.
 *
 * Both numbers have to match the roll exactly. A page even slightly larger than the label
 * walks down the roll a fraction at a time, and twenty labels later the print is across the
 * gap. The printer's own driver must be set to the same figures.
 */
export const LABEL_WIDTH_MM = 50;
export const LABEL_HEIGHT_MM = 30;

export interface LabelItem {
  name: string;
  barcode: string | null;
  price_cents: number;
  /** How many of this label to print. One per article on the shelf, usually. */
  copies: number;
}

/**
 * Shelf labels, one article to a label.
 *
 * Fifty by thirty millimetres is not much room, and the barcode is the part that cannot be
 * compromised: a name squeezed to fit is still readable, a barcode squeezed to fit does not
 * scan and the label is worthless. So the barcode gets the middle of the label at a fixed
 * height, and the name takes whatever is left above it, clipped at two lines.
 *
 * Copies are pages rather than repeats within a page. The printer advances one die-cut label
 * per page, so N copies is N pages and the gap sensor does the rest.
 */
export class LabelDocument {
  static build(items: readonly LabelItem[]): string {
    const pages: string[] = [];

    for (const item of items) {
      const copies = Math.max(1, Math.floor(item.copies));
      for (let i = 0; i < copies; i += 1) pages.push(label(item));
    }

    if (pages.length === 0) {
      return wrap('<div class="label"><div class="name">Nothing to print</div></div>');
    }

    return wrap(
      pages
        .map((page, index) =>
          index === pages.length - 1
            ? `<div class="label">${page}</div>`
            : `<div class="label" style="page-break-after:always">${page}</div>`,
        )
        .join(''),
    );
  }

  /** How many labels a run would produce, so the shop is told before it commits. */
  static count(items: readonly LabelItem[]): number {
    return items.reduce((total, item) => total + Math.max(1, Math.floor(item.copies)), 0);
  }
}

function label(item: LabelItem): string {
  return [
    `<div class="name">${escape(item.name)}</div>`,
    `<div class="code">${item.barcode ? barcodeFor(item.barcode) : ''}</div>`,
    `<div class="price">${Money.fromCents(item.price_cents).format()}</div>`,
  ].join('');
}

/** EAN-13 where the code is one, Code 39 otherwise, so any code still prints something. */
function barcodeFor(code: string): string {
  try {
    return ean13Svg(code, { height: 44 });
  } catch {
    return code39Svg(code, { height: 40 });
  }
}

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrap(body: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Labels</title>
<style>
  /*
    Sized to the stock, exactly. Unlike a receipt, a label has a real page size: the roll
    decides it, and the page has to agree or the print walks off the label.
  */
  @page { size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .label {
    width: ${LABEL_WIDTH_MM}mm;
    height: ${LABEL_HEIGHT_MM}mm;
    padding: 1.2mm 1.5mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    overflow: hidden;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  /*
    Two lines at most. A long article name would otherwise push the barcode off the bottom of
    the label, which trades the one thing that must work for the one thing that need not.
  */
  .name {
    width: 100%;
    font-size: 2.5mm;
    font-weight: 700;
    line-height: 1.15;
    text-align: center;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }

  .code { width: 100%; flex: 1; display: flex; align-items: center; justify-content: center; }
  .code svg { width: 100%; max-height: 100%; height: auto; display: block; }

  .price { font-size: 4mm; font-weight: 700; line-height: 1; }
</style>
</head>
<body>${body}</body>
</html>`;
}
