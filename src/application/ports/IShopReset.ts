/** What the reset removed, so the app can say so rather than just claiming success. */
export interface ResetCounts {
  sales: number;
  saleItems: number;
  stockMovements: number;
  cashMovements: number;
  products: number;
  categories: number;
}

/**
 * Emptying the shop.
 *
 * Behind its own port because it is the one operation with no undo. Keeping it apart from the
 * repositories means nothing that routinely writes data can reach it by accident.
 */
export interface IShopReset {
  /** `confirmation` must be the word RESET. Anything else is refused by the database. */
  reset(confirmation: string): Promise<ResetCounts>;
}
