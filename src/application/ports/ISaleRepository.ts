import type {
  DateRange,
  DiscountType,
  PaymentCurrency,
  Sale,
  SaleRecord,
  SoldLine,
} from '@/domain';

export interface CheckoutLine {
  productId: string;
  quantity: number;
  /**
   * Which batch these units are coming off.
   *
   * Only ever set in batch mode, and only when the article is holding stock at more than one
   * price. Left out, the oldest stock goes first.
   */
  batchId?: string | null;
}

export interface CheckoutRequest {
  items: ReadonlyArray<CheckoutLine>;
  discountType: DiscountType;
  discountValue: number;
  paymentCurrency: PaymentCurrency;
  note?: string | null;
}

/** One line being handed back, and how many of it. */
export interface RefundLine {
  saleItemId: string;
  quantity: number;
}

export interface RefundResult {
  refundId: string;
  totalCents: number;
  units: number;
}

export interface VoidResult {
  saleId: string;
  lines: number;
  units: number;
  totalCents: number;
}

export interface ISaleRepository {
  /**
   * Posts the basket. Only ids, quantities, the chosen batch and the discount travel: every
   * price and total is recomputed by the database, so the figure that lands in the books
   * cannot be one the device made up or one it read before the last price change.
   */
  checkout(request: CheckoutRequest): Promise<string>;
  findById(id: string): Promise<Sale | null>;
  /** The till roll, newest first. Voided sales are included, marked rather than hidden. */
  list(range: DateRange | null, limit?: number): Promise<SaleRecord[]>;
  /** One sale's lines, each carrying how much of it has already been handed back. */
  lines(saleId: string): Promise<SoldLine[]>;
  /** Erases a sale outright: stock back, money back, gone from every report. */
  void(saleId: string, reason?: string | null): Promise<VoidResult>;
  /** Hands part or all of a sale back, dated today. */
  refund(
    saleId: string,
    lines: ReadonlyArray<RefundLine>,
    reason?: string | null,
  ): Promise<RefundResult>;
}
