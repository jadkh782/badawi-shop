import { Money } from '../value-objects/Money';

/** One row of the best-sellers table. */
export class ProductSalesStat {
  constructor(
    readonly productId: string | null,
    readonly productName: string,
    readonly barcode: string | null,
    readonly categoryName: string | null,
    readonly quantitySold: number,
    readonly revenue: Money,
    readonly profit: Money,
  ) {}
}

/** One bucket of the trend chart: a day, a week or a month. */
export class TimeSeriesPoint {
  constructor(
    readonly bucketStart: Date,
    readonly label: string,
    readonly sales: Money,
    readonly profit: Money,
    readonly transactionCount: number,
    readonly itemsSold: number,
  ) {}
}

/** One row of the sales-by-category breakdown. */
export class CategorySalesStat {
  constructor(
    readonly categoryName: string,
    readonly quantitySold: number,
    readonly revenue: Money,
    readonly profit: Money,
  ) {}
}

/** One row of the restocking list. */
export class LowStockItem {
  constructor(
    readonly productId: string,
    readonly productName: string,
    readonly barcode: string | null,
    readonly categoryName: string | null,
    readonly stock: number,
    readonly threshold: number,
    readonly unit: string,
  ) {}
}
