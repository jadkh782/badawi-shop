/**
 * What a receipt is allowed to know.
 *
 * Flat and primitive, like the spreadsheet's ExportPayload, and for a sharper reason than
 * tidiness. A Sale carries unitCost, lineCost, lineProfit, totalCost and profit; handing the
 * document builder a Sale and trusting it to look away would put the shop's margins one
 * careless loop away from the customer's hand. This shape simply has nowhere to put them.
 *
 * Amounts stay in integer cents until the moment they are formatted, as everywhere else.
 */

export interface ReceiptLine {
  name: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
  line_total_cents: number;
}

export interface ReceiptPayload {
  /** A sale slip and a refund slip differ in wording and sign, not in shape. */
  kind: 'sale' | 'refund';

  shop_name: string;
  shop_phone: string | null;
  shop_address: string | null;
  footer: string | null;

  sale_id: string;
  sold_at: string;
  /** When this copy was printed, which is not when the sale happened on a reprint. */
  printed_at: string;
  is_reprint: boolean;
  is_voided: boolean;

  lines: ReceiptLine[];
  subtotal_cents: number;
  /** "10% off" or "$2.50 off", already worded. Null when the sale had no discount. */
  discount_label: string | null;
  discount_cents: number;
  total_cents: number;

  /**
   * The pound figure frozen onto the sale, not one worked out now.
   *
   * The rate moves. Recomputing would print a figure the customer never paid, and the
   * rounding step is not even stored on the sale, so it could not be reproduced faithfully
   * if it tried.
   */
  total_lbp: number;
  usd_to_lbp_rate: number;

  payment_currency: string;
  item_count: number;
  note: string | null;
}

/** A shelf ticket for an article, with the barcode the scanner reads. */
export interface LabelPayload {
  shop_name: string;
  product_name: string;
  barcode: string | null;
  price_cents: number;
  price_lbp: number | null;
}
