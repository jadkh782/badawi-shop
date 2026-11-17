import { Money } from '@/domain';
import { ean13Svg, code39Svg } from './barcodeSvg';

export interface ScanSheetItem {
  name: string;
  barcode: string;
  price_cents: number;
  category: string;
}

export interface ScanSheetPayload {
  shop_name: string;
  printed_at: string;
  items: ScanSheetItem[];
}

/**
 * Every barcode on sheets of A4, to scan from rather than stick on.
 *
 * A shop with hundreds of articles and no barcodes on any of them has two ways out. One is
 * printing a label per article and sticking each on by hand, which is an afternoon's work
 * and starts coming unstuck the same week. The other is one sheet per shelf behind the
 * counter, scanned straight off the paper. For loose goods — charcoal, a scoop of something,
 * anything with no box to stick a label to — the sheet is the only option that works at all.
 *
 * Which means this is a different document from a receipt, not a variation on one: A4 rather
 * than an 80mm roll, a grid rather than a column, and bound for the office printer rather
 * than the thermal one.
 *
 * Laid out for scanning first and density second. Three to a row rather than five, because a
 * handheld scanner pointed at a crowded sheet is how the wrong article ends up in the
 * basket, and a page that holds eight more codes is no bargain against that.
 */
export class ScanSheetDocument {
  static build(payload: ScanSheetPayload): string {
    const printable = payload.items.filter((item) => item.barcode);

    if (printable.length === 0) {
      return wrap(
        payload.shop_name,
        '<p class="empty">No article here has a barcode to scan yet.</p>',
      );
    }

    // Grouped by shelf, because that is how someone standing at the counter looks for one.
    const shelves = new Map<string, ScanSheetItem[]>();
    for (const item of printable) {
      const key = item.category || 'Uncategorised';
      shelves.set(key, [...(shelves.get(key) ?? []), item]);
    }

    const sections = [...shelves.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([shelf, items]) => {
        const cells = items
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((item) => cell(item))
          .join('');
        return `<section class="shelf">
            <h2>${escape(shelf)} <span class="count">${items.length}</span></h2>
            <div class="grid">${cells}</div>
          </section>`;
      })
      .join('');

    const header = `<header>
        <h1>${escape(payload.shop_name)}</h1>
        <p>Scan sheet &middot; ${escape(day(payload.printed_at))} &middot; ${
          printable.length
        } articles</p>
      </header>`;

    return wrap(payload.shop_name, header + sections);
  }
}

function cell(item: ScanSheetItem): string {
  return `<div class="cell">
      <div class="name">${escape(item.name)}</div>
      <div class="price">${Money.fromCents(item.price_cents).format()}</div>
      <div class="code">${barcodeFor(item.barcode)}</div>
    </div>`;
}

/** EAN-13 where it is one, Code 39 otherwise, so a supplier code of any shape still prints. */
function barcodeFor(code: string): string {
  try {
    return ean13Svg(code, { height: 56 });
  } catch {
    return code39Svg(code, { height: 48 });
  }
}

function day(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrap(shopName: string, body: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Scan sheet &middot; ${escape(shopName)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  header { border-bottom: 2px solid #000; padding-bottom: 2mm; margin-bottom: 4mm; }
  header h1 { margin: 0; font-size: 16pt; letter-spacing: .5px; }
  header p { margin: 1mm 0 0; font-size: 9pt; color: #444; }

  .shelf { margin-bottom: 6mm; }
  .shelf h2 {
    margin: 0 0 2mm;
    font-size: 11pt;
    text-transform: uppercase;
    letter-spacing: 1px;
    border-bottom: 1px solid #999;
    padding-bottom: 1mm;
    /* A heading alone at the foot of a page sends the reader to the wrong shelf. */
    break-after: avoid;
    page-break-after: avoid;
  }
  .shelf h2 .count { float: right; font-weight: 400; color: #666; }

  /*
    Three across. A barcode split by a page break is a barcode that will not scan, so no cell
    is ever allowed to straddle one.
  */
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
  .cell {
    border: 1px solid #ccc;
    border-radius: 2mm;
    padding: 2mm;
    text-align: center;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .cell .name {
    font-size: 9pt;
    font-weight: 700;
    line-height: 1.2;
    min-height: 2.4em;
    overflow-wrap: anywhere;
  }
  .cell .price { font-size: 9pt; color: #333; margin: 1mm 0; }
  .cell .code svg { width: 100%; height: auto; display: block; }

  .empty { font-size: 11pt; color: #444; }
</style>
</head>
<body>${body}</body>
</html>`;
}
