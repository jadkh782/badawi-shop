import { DiscountFactory, type Product, type Sale, type ShopSettings } from '@/domain';
import type { IReceiptPrinter, PrintOutcome } from '@/application/ports';
import { ReceiptDocument } from './ReceiptDocument';
import { ScanSheetDocument } from './ScanSheetDocument';
import {
  LABEL_HEIGHT_MM,
  LABEL_WIDTH_MM,
  LabelDocument,
  type LabelItem,
} from './LabelDocument';
import type { ReceiptLine, ReceiptPayload } from './receiptTypes';

export interface ReceiptOptions {
  /** True for any copy after the first, so the slip says so. */
  reprint?: boolean;
  /** True when the sale has since been taken back. */
  voided?: boolean;
}

/**
 * Turns a sale into a receipt and puts it on paper.
 *
 * The mapping lives here rather than in a screen so that a receipt printed from the till and
 * one reprinted from the till roll are the same document built the same way. It is also the
 * one place that decides what a customer is shown, which is easier to keep honest as a
 * single function than as two screens that happen to agree today.
 *
 * Mirrors ClientReportExporter: domain objects in, a flat payload in the middle, a finished
 * document out to a port that knows about devices and nothing about shops.
 */
export class ReceiptPrinting {
  constructor(private readonly printer: IReceiptPrinter) {}

  get printerName(): string {
    return this.printer.name;
  }

  async sale(
    sale: Sale,
    settings: ShopSettings,
    options: ReceiptOptions = {},
  ): Promise<PrintOutcome> {
    const payload = ReceiptPrinting.toPayload(sale, settings, options);
    return this.printer.print({
      title: `Receipt ${sale.id.slice(0, 8)}`,
      html: ReceiptDocument.receipt(payload),
    });
  }

  /**
   * Shelf labels, on the label printer.
   *
   * Each article can ask for more than one, because a shelf holding six of something wants
   * six labels, and the alternative is tapping print six times. The count comes from the
   * caller rather than from the stock level here: the shop sometimes wants one to check the
   * alignment, and sometimes one per unit on the shelf.
   *
   * Articles with no barcode are dropped. A label with a name and a price but nothing to
   * scan does not do the job the label exists for.
   */
  async labels(
    items: ReadonlyArray<{ product: Product; copies: number }>,
    _settings: ShopSettings,
  ): Promise<PrintOutcome> {
    const printable: LabelItem[] = items
      .filter((item) => item.product.barcode !== null)
      .map((item) => ({
        name: item.product.name,
        barcode: item.product.barcode?.value ?? null,
        price_cents: item.product.salePrice.cents,
        copies: Math.max(1, Math.floor(item.copies)),
      }));

    if (printable.length === 0) return 'unavailable';

    const total = LabelDocument.count(printable);
    return this.printer.print({
      title: total === 1 ? 'Label' : `${total} labels`,
      html: LabelDocument.build(printable),
      destination: 'label',
      // The stock decides this, so it is stated rather than measured. Measuring is for
      // receipts, whose length is the sale's rather than the paper's.
      pageSizeMm: { width: LABEL_WIDTH_MM, height: LABEL_HEIGHT_MM },
    });
  }

  /** One article, however many copies. */
  async label(
    product: Product,
    settings: ShopSettings,
    copies = 1,
  ): Promise<PrintOutcome> {
    return this.labels([{ product, copies }], settings);
  }

  /**
   * Every barcode on A4, grouped by shelf, to scan from rather than stick on.
   *
   * Sticking a label on each of several hundred articles is an afternoon that starts coming
   * unstuck the same week, and loose goods have nothing to stick one to. A sheet behind the
   * counter solves both.
   *
   * It asks where to print rather than assuming the till printer, whose roll is 80mm wide
   * and would turn an A4 page into a long ribbon of fragments.
   */
  async scanSheet(
    products: readonly Product[],
    settings: ShopSettings,
  ): Promise<PrintOutcome> {
    const items = products
      .filter((product) => product.barcode !== null)
      .map((product) => ({
        name: product.name,
        barcode: product.barcode?.value ?? '',
        price_cents: product.salePrice.cents,
        category: product.categoryName ?? 'Uncategorised',
      }));

    if (items.length === 0) return 'unavailable';

    return this.printer.print({
      title: `Scan sheet (${items.length})`,
      html: ScanSheetDocument.build({
        shop_name: settings.shopName,
        printed_at: new Date().toISOString(),
        items,
      }),
      destination: 'ask',
    });
  }

  /**
   * Everything the customer is allowed to see, and nothing else.
   *
   * Written field by field on purpose. Spreading a Sale would carry totalCost, profit and
   * every line's cost straight onto the page, and the day that happens nobody notices until
   * a customer is holding the margin in their hand.
   */
  static toPayload(
    sale: Sale,
    settings: ShopSettings,
    options: ReceiptOptions = {},
  ): ReceiptPayload {
    const lines: ReceiptLine[] = sale.items.map((item) => ({
      name: item.productName,
      quantity: item.quantity.value,
      unit: item.unit,
      unit_price_cents: item.unitPrice.cents,
      line_total_cents: item.lineTotal.cents,
    }));

    return {
      kind: 'sale',
      shop_name: settings.shopName,
      shop_phone: settings.shopPhone,
      shop_address: settings.shopAddress,
      footer: settings.receiptFooter,

      sale_id: sale.id,
      sold_at: sale.soldAt.toISOString(),
      printed_at: new Date().toISOString(),
      is_reprint: options.reprint ?? false,
      is_voided: options.voided ?? false,

      lines,
      subtotal_cents: sale.subtotal.cents,
      // Worded by the same factory the cart uses, so the slip says what the screen said.
      discount_label: sale.discountAmount.isZero()
        ? null
        : DiscountFactory.create(sale.discountType, sale.discountValue).describe(),
      discount_cents: sale.discountAmount.cents,
      total_cents: sale.total.cents,

      // Both frozen onto the sale. Today's rate would print a figure nobody ever paid.
      total_lbp: sale.totalLbp,
      usd_to_lbp_rate: sale.usdToLbpRate,

      payment_currency: sale.paymentCurrency,
      item_count: sale.itemCount,
      note: sale.note,
    };
  }
}
