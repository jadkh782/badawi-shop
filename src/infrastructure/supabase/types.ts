/**
 * The shape of the database as the client sees it.
 *
 * Written by hand and kept alongside the migrations rather than generated, so that a change
 * to a table shows up as a type error in the repository that reads it.
 */
export interface ProductRow {
  id: string;
  barcode: string | null;
  name: string;
  category_id: string | null;
  cost_price_cents: number;
  sale_price_cents: number;
  quantity_in_stock: number;
  low_stock_threshold: number;
  unit: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** The price the last delivery was charged at, kept apart from the costing figure. */
  last_cost_price_cents: number | null;
  variant_size: string | null;
  variant_trait: string | null;
  categories?: { name: string } | null;
}

export interface CategoryRow {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  /** Null on shelves that do not come in sizes, which is most of them. */
  variant_sizes: string[] | null;
  variant_trait_label: string | null;
}

export interface SaleRow {
  id: string;
  sold_at: string;
  subtotal_cents: number;
  discount_type: 'none' | 'percent' | 'amount';
  discount_value: number;
  discount_cents: number;
  total_cents: number;
  total_cost_cents: number;
  profit_cents: number;
  payment_currency: 'USD' | 'LBP';
  usd_to_lbp_rate: number;
  total_lbp: number;
  item_count: number;
  note: string | null;
  sale_items?: SaleItemRow[];
}

export interface SaleItemRow {
  id: string;
  product_id: string | null;
  product_name: string;
  barcode: string | null;
  category_name: string | null;
  unit: string;
  unit_price_cents: number;
  unit_cost_cents: number;
  quantity: number;
  line_total_cents: number;
  line_cost_cents: number;
  line_profit_cents: number;
}

export interface AppSettingsRow {
  id: number;
  shop_name: string;
  usd_to_lbp_rate: number;
  lbp_rounding: number;
  rate_updated_at: string | null;
  cost_method: 'average' | 'batch';
}

export interface ReportSummaryRow {
  total_sales_cents: number;
  total_cost_cents: number;
  total_profit_cents: number;
  total_discount_cents: number;
  transaction_count: number;
  items_sold: number;
  paid_usd_cents: number;
  paid_lbp_cents: number;
  refunded_cents: number;
  refund_count: number;
  voided_cents: number;
  voided_count: number;
}

export interface StockBatchRow {
  id: string;
  unit_cost_cents: number;
  quantity_remaining: number;
  quantity_received: number;
  source: 'opening' | 'restock' | 'average' | 'correction';
  note: string | null;
  received_at: string;
}

export interface PriceHistoryRow {
  id: string;
  changed_at: string;
  source: 'opening' | 'restock' | 'manual' | 'method';
  quantity: number | null;
  purchase_cost_cents: number | null;
  old_cost_cents: number;
  new_cost_cents: number;
  old_sale_price_cents: number;
  new_sale_price_cents: number;
  note: string | null;
}

/** What adjust_stock hands back: the new count, and what it did to the prices. */
export interface StockChangeRow {
  stock: number;
  cost_price_cents: number;
  previous_cost_cents: number;
  sale_price_cents: number;
  previous_sale_cents: number;
  last_cost_cents: number | null;
  cost_changed: boolean;
  sale_price_changed: boolean;
}

export interface SaleListRow {
  id: string;
  sold_at: string;
  total_cents: number;
  profit_cents: number;
  item_count: number;
  payment_currency: 'USD' | 'LBP';
  total_lbp: number;
  note: string | null;
  voided_at: string | null;
  void_reason: string | null;
  refunded_cents: number;
  refunded_items: number;
  refund_count: number;
}

export interface SoldLineRow {
  id: string;
  product_id: string | null;
  product_name: string;
  barcode: string | null;
  category_name: string | null;
  unit: string;
  quantity: number;
  unit_price_cents: number;
  unit_cost_cents: number;
  line_total_cents: number;
  net_cents: number;
  refunded_quantity: number;
}

export interface BudgetRow {
  balance_cents: number;
  from_sales_cents: number;
  spent_restock_cents: number;
  spent_opening_cents: number;
  invested_cents: number;
  corrections_cents: number;
  refunded_cents: number;
  voided_cents: number;
  removed_cents: number;
  entry_count: number;
}

export interface InventoryValueRow {
  cost_value_cents: number;
  retail_value_cents: number;
  article_count: number;
  unit_count: number;
}

export interface TopProductRow {
  product_id: string | null;
  product_name: string;
  barcode: string | null;
  category_name: string | null;
  quantity_sold: number;
  revenue_cents: number;
  profit_cents: number;
}

export interface CategoryStatRow {
  category_name: string;
  quantity_sold: number;
  revenue_cents: number;
  profit_cents: number;
}

export interface TimeSeriesRow {
  bucket_start: string;
  sales_cents: number;
  profit_cents: number;
  transaction_count: number;
  items_sold: number;
}

export interface LowStockRow {
  product_id: string;
  product_name: string;
  barcode: string | null;
  category_name: string | null;
  stock: number;
  threshold: number;
  unit: string;
}

/** Postgres hands numeric columns back as strings to preserve precision. */
export function num(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}
