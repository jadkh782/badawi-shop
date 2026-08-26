import {
  Barcode,
  Category,
  CategorySalesStat,
  ExchangeRate,
  LowStockItem,
  Money,
  Product,
  ProductSalesStat,
  Quantity,
  Sale,
  SaleItem,
  SalesSummary,
  ShopSettings,
  TimeSeriesPoint,
} from '@/domain';
import type {
  AppSettingsRow,
  CategoryRow,
  CategoryStatRow,
  LowStockRow,
  ProductRow,
  ReportSummaryRow,
  SaleItemRow,
  SaleRow,
  TimeSeriesRow,
  TopProductRow,
} from '../types';
import { num } from '../types';

/**
 * The boundary where database rows become domain objects.
 *
 * Keeping it in one file means nothing above the infrastructure layer ever sees a snake_case
 * key or a numeric-as-string, and swapping the backing store would rewrite this file rather
 * than the application.
 */
export function toProduct(row: ProductRow): Product {
  return new Product({
    id: row.id,
    barcode: Barcode.tryCreate(row.barcode),
    name: row.name,
    categoryId: row.category_id,
    categoryName: row.categories?.name ?? null,
    costPrice: Money.fromCents(num(row.cost_price_cents)),
    salePrice: Money.fromCents(num(row.sale_price_cents)),
    stock: Quantity.of(num(row.quantity_in_stock)),
    lowStockThreshold: Quantity.of(num(row.low_stock_threshold)),
    unit: row.unit,
    notes: row.notes,
    isActive: row.is_active,
  });
}

export function toCategory(row: CategoryRow): Category {
  return new Category(row.id, row.name, row.color, num(row.sort_order), row.is_active);
}

export function toSettings(row: AppSettingsRow): ShopSettings {
  return new ShopSettings(
    row.shop_name,
    ExchangeRate.create(num(row.usd_to_lbp_rate), num(row.lbp_rounding) || 1000),
    row.rate_updated_at ? new Date(row.rate_updated_at) : null,
  );
}

export function toSaleItem(row: SaleItemRow): SaleItem {
  return new SaleItem(
    row.id,
    row.product_id,
    row.product_name,
    row.barcode,
    row.category_name,
    row.unit,
    Money.fromCents(num(row.unit_price_cents)),
    Money.fromCents(num(row.unit_cost_cents)),
    Quantity.of(num(row.quantity)),
    Money.fromCents(num(row.line_total_cents)),
    Money.fromCents(num(row.line_cost_cents)),
    Money.fromCents(num(row.line_profit_cents)),
  );
}

export function toSale(row: SaleRow): Sale {
  return new Sale(
    row.id,
    new Date(row.sold_at),
    Money.fromCents(num(row.subtotal_cents)),
    row.discount_type,
    num(row.discount_value),
    Money.fromCents(num(row.discount_cents)),
    Money.fromCents(num(row.total_cents)),
    Money.fromCents(num(row.total_cost_cents)),
    Money.fromCents(num(row.profit_cents)),
    row.payment_currency,
    num(row.usd_to_lbp_rate),
    num(row.total_lbp),
    num(row.item_count),
    row.note,
    (row.sale_items ?? []).map(toSaleItem),
  );
}

export function toSummary(row: ReportSummaryRow | undefined): SalesSummary {
  if (!row) return SalesSummary.empty();
  return new SalesSummary(
    Money.fromCents(num(row.total_sales_cents)),
    Money.fromCents(num(row.total_cost_cents)),
    Money.fromCents(num(row.total_profit_cents)),
    Money.fromCents(num(row.total_discount_cents)),
    num(row.transaction_count),
    num(row.items_sold),
    Money.fromCents(num(row.paid_usd_cents)),
    Money.fromCents(num(row.paid_lbp_cents)),
  );
}

export function toProductStat(row: TopProductRow): ProductSalesStat {
  return new ProductSalesStat(
    row.product_id,
    row.product_name,
    row.barcode,
    row.category_name,
    num(row.quantity_sold),
    Money.fromCents(num(row.revenue_cents)),
    Money.fromCents(num(row.profit_cents)),
  );
}

export function toCategoryStat(row: CategoryStatRow): CategorySalesStat {
  return new CategorySalesStat(
    row.category_name,
    num(row.quantity_sold),
    Money.fromCents(num(row.revenue_cents)),
    Money.fromCents(num(row.profit_cents)),
  );
}

export function toLowStock(row: LowStockRow): LowStockItem {
  return new LowStockItem(
    row.product_id,
    row.product_name,
    row.barcode,
    row.category_name,
    num(row.stock),
    num(row.threshold),
    row.unit,
  );
}

export function toSeriesPoint(row: TimeSeriesRow, label: string): TimeSeriesPoint {
  return new TimeSeriesPoint(
    new Date(row.bucket_start),
    label,
    Money.fromCents(num(row.sales_cents)),
    Money.fromCents(num(row.profit_cents)),
    num(row.transaction_count),
    num(row.items_sold),
  );
}
