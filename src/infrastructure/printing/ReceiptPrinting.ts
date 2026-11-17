import { DiscountFactory, type Product, type Sale, type ShopSettings } from '@/domain';
import type { IReceiptPrinter, PrintOutcome } from '@/application/ports';
import { ReceiptDocument } from './ReceiptDocument';
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

  /** A shelf ticket, which is how a generated barcode gets somewhere a scanner can reach. */
  async label(product: Product, settings: ShopSettings): Promise<PrintOutcome> {
    return this.printer.print({
      title: `Label ${product.name}`,
      html: ReceiptDocument.label({
        shop_name: settings.shopName,
        product_name: product.name,
        barcode: product.barcode?.value ?? null,
        price_cents: product.salePrice.cents,
        // A label is printed today for a shelf read today, so today's rate is the right one
        // here — unlike a receipt, which has to reproduce a past moment.
        price_lbp: settings.exchangeRate.toLbp(product.salePrice),
      }),
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
