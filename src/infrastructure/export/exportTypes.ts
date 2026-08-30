import type { ReportBucket } from '@/domain';

/** The raw rows the workbook needs beyond the aggregates the screen already shows. */
export interface ExportSaleRow {
  id: string;
  sold_at: string;
  subtotal_cents: number;
  discount_type: string;
  discount_value: number;
  discount_cents: number;
  total_cents: number;
  total_cost_cents: number;
  profit_cents: number;
  payment_currency: string;
  usd_to_lbp_rate: number;
  total_lbp: number;
  item_count: number;
  note: string | null;
}

export interface ExportLineRow {
  sale_id: string;
  sold_at: string;
  product_name: string;
  barcode: string | null;
  category_name: string;
  unit: string;
  quantity: number;
  unit_price_cents: number;
  unit_cost_cents: number;
  gross_cents: number;
  net_cents: number;
  cost_cents: number;
  net_profit_cents: number;
}

export interface ExportPayload {
  shopName: string;
  rangeLabel: string;
  bucket: ReportBucket;
  usdToLbp: number;
  summary: {
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
  };
  series: Array<{
    bucket_start: string;
    sales_cents: number;
    profit_cents: number;
    transaction_count: number;
    items_sold: number;
  }>;
  topProducts: Array<{
    product_name: string;
    barcode: string | null;
    category_name: string | null;
    quantity_sold: number;
    revenue_cents: number;
    profit_cents: number;
  }>;
  byCategory: Array<{
    category_name: string;
    quantity_sold: number;
    revenue_cents: number;
    profit_cents: number;
  }>;
  lowStock: Array<{
    product_name: string;
    barcode: string | null;
    category_name: string | null;
    stock: number;
    threshold: number;
    unit: string;
  }>;
  sales: ExportSaleRow[];
  lines: ExportLineRow[];
}
