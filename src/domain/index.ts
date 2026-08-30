export { Money } from './value-objects/Money';
export { Barcode } from './value-objects/Barcode';
export { Quantity } from './value-objects/Quantity';
export { ExchangeRate } from './value-objects/ExchangeRate';
export { DateRange } from './value-objects/DateRange';
export type { ReportBucket } from './value-objects/DateRange';

export { Category } from './entities/Category';
export { Product } from './entities/Product';
export type { ProductProps } from './entities/Product';
export { Cart } from './entities/Cart';
export { CartLine } from './entities/CartLine';
export { Sale, SaleItem } from './entities/Sale';
export type { PaymentCurrency } from './entities/Sale';
export { ShopSettings } from './entities/ShopSettings';
export type { CostMethod } from './entities/ShopSettings';
export { StockBatch, PriceChange } from './entities/StockBatch';
export type { BatchSource, PriceChangeSource } from './entities/StockBatch';
export { SaleRecord, SoldLine } from './entities/SaleRecord';

export * from './discounts';
export * from './errors';

export { SalesSummary } from './reports/SalesSummary';
export { BudgetSummary, CashMovement, InventoryValue } from './reports/Budget';
export type { CashKind } from './reports/Budget';
export {
  ProductSalesStat,
  TimeSeriesPoint,
  CategorySalesStat,
  LowStockItem,
} from './reports/ProductSalesStat';
