import ExcelJS from 'exceljs';
import type { ExportPayload } from './exportTypes';
import {
  DATE_FORMAT,
  DAY_FORMAT,
  LBP_FORMAT,
  QTY_FORMAT,
  USD_FORMAT,
  cents,
  markTotalRow,
  styleSheet,
} from './workbookStyle';

const BUCKET_LABEL: Record<string, string> = {
  daily: 'Day',
  weekly: 'Week beginning',
  monthly: 'Month',
};

/**
 * Builds the workbook the shop downloads.
 *
 * Returns raw bytes rather than a Node Buffer or a browser Blob, so the same builder serves
 * a download in the browser and a file written to disk in a test.
 *
 * Money is written as real numbers carrying a currency format, never as pre-formatted text.
 * That is the difference between a report the shop can re-sort and total in Excel and a
 * picture of one.
 */
export class ExcelWorkbookBuilder {
  async build(payload: ExportPayload): Promise<Uint8Array<ArrayBuffer>> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = payload.shopName;
    workbook.created = new Date();

    this.addSummary(workbook, payload);
    this.addPeriods(workbook, payload);
    this.addTopProducts(workbook, payload);
    this.addCategories(workbook, payload);
    this.addSales(workbook, payload);
    this.addLines(workbook, payload);
    this.addLowStock(workbook, payload);

    const buffer = await workbook.xlsx.writeBuffer();
    return new Uint8Array(buffer as ArrayBuffer);
  }

  private addSummary(workbook: ExcelJS.Workbook, p: ExportPayload): void {
    const sheet = workbook.addWorksheet('Summary');
    sheet.columns = [
      { header: 'Figure', key: 'k', width: 30 },
      { header: 'Value', key: 'v', width: 22 },
    ];

    const s = p.summary;
    const money = (v: number) => ({ value: cents(v), fmt: USD_FORMAT });
    const plain = (v: number) => ({ value: v, fmt: QTY_FORMAT });

    const rows: Array<[string, { value: number | string; fmt?: string }]> = [
      ['Shop', { value: p.shopName }],
      ['Period', { value: p.rangeLabel }],
      ['Grouped by', { value: BUCKET_LABEL[p.bucket] ?? p.bucket }],
      ['Exchange rate used', { value: p.usdToLbp, fmt: '#,##0 "L.L. per $1"' }],
      ['', { value: '' }],
      ['Total sales', money(s.total_sales_cents)],
      ['Total sales (LBP)', { value: Math.round(cents(s.total_sales_cents) * p.usdToLbp), fmt: LBP_FORMAT }],
      ['Cost of goods sold', money(s.total_cost_cents)],
      ['Total profit', money(s.total_profit_cents)],
      ['Discounts given', money(s.total_discount_cents)],
      ['', { value: '' }],
      ['Transactions', plain(s.transaction_count)],
      ['Items sold', plain(s.items_sold)],
      [
        'Average basket',
        money(s.transaction_count ? Math.round(s.total_sales_cents / s.transaction_count) : 0),
      ],
      [
        'Profit margin',
        {
          value: s.total_sales_cents ? s.total_profit_cents / s.total_sales_cents : 0,
          fmt: '0.0%',
        },
      ],
      ['', { value: '' }],
      ['Cash taken in USD', money(s.paid_usd_cents)],
      ['Cash taken in LBP', money(s.paid_lbp_cents)],
    ];

    for (const [label, cell] of rows) {
      const row = sheet.addRow({ k: label, v: cell.value });
      if (cell.fmt) row.getCell('v').numFmt = cell.fmt;
      if (label !== '' && cell.value === '') row.getCell('k').font = { bold: true };
    }

    sheet.getColumn('k').font = { bold: false };
    styleSheet(sheet, { autoFilter: false });
  }

  private addPeriods(workbook: ExcelJS.Workbook, p: ExportPayload): void {
    const sheet = workbook.addWorksheet(BUCKET_LABEL[p.bucket] ?? 'Periods');
    sheet.columns = [
      { header: BUCKET_LABEL[p.bucket] ?? 'Period', key: 'd', width: 18 },
      { header: 'Sales', key: 'sales', width: 14 },
      { header: 'Sales (LBP)', key: 'lbp', width: 18 },
      { header: 'Profit', key: 'profit', width: 14 },
      { header: 'Transactions', key: 'txn', width: 14 },
      { header: 'Items sold', key: 'items', width: 12 },
    ];

    for (const point of p.series) {
      const row = sheet.addRow({
        d: new Date(point.bucket_start),
        sales: cents(point.sales_cents),
        lbp: Math.round(cents(point.sales_cents) * p.usdToLbp),
        profit: cents(point.profit_cents),
        txn: point.transaction_count,
        items: point.items_sold,
      });
      row.getCell('d').numFmt = DAY_FORMAT;
      row.getCell('sales').numFmt = USD_FORMAT;
      row.getCell('lbp').numFmt = LBP_FORMAT;
      row.getCell('profit').numFmt = USD_FORMAT;
      row.getCell('items').numFmt = QTY_FORMAT;
    }

    if (p.series.length > 0) {
      const first = 2;
      const last = p.series.length + 1;
      const total = sheet.addRow({
        d: 'Total',
        sales: { formula: `SUM(B${first}:B${last})` },
        lbp: { formula: `SUM(C${first}:C${last})` },
        profit: { formula: `SUM(D${first}:D${last})` },
        txn: { formula: `SUM(E${first}:E${last})` },
        items: { formula: `SUM(F${first}:F${last})` },
      });
      total.getCell('sales').numFmt = USD_FORMAT;
      total.getCell('lbp').numFmt = LBP_FORMAT;
      total.getCell('profit').numFmt = USD_FORMAT;
      total.getCell('items').numFmt = QTY_FORMAT;
      markTotalRow(sheet, total.number);
    }

    styleSheet(sheet);
  }

  private addTopProducts(workbook: ExcelJS.Workbook, p: ExportPayload): void {
    const sheet = workbook.addWorksheet('Top Products');
    sheet.columns = [
      { header: 'Rank', key: 'rank', width: 7 },
      { header: 'Product', key: 'name', width: 34 },
      { header: 'Barcode', key: 'barcode', width: 18 },
      { header: 'Category', key: 'category', width: 18 },
      { header: 'Quantity sold', key: 'qty', width: 14 },
      { header: 'Revenue', key: 'revenue', width: 14 },
      { header: 'Profit', key: 'profit', width: 14 },
      { header: 'Margin', key: 'margin', width: 10 },
    ];

    p.topProducts.forEach((item, index) => {
      const row = sheet.addRow({
        rank: index + 1,
        name: item.product_name,
        barcode: item.barcode ?? '',
        category: item.category_name ?? 'Uncategorised',
        qty: item.quantity_sold,
        revenue: cents(item.revenue_cents),
        profit: cents(item.profit_cents),
        margin: item.revenue_cents ? item.profit_cents / item.revenue_cents : 0,
      });
      row.getCell('qty').numFmt = QTY_FORMAT;
      row.getCell('revenue').numFmt = USD_FORMAT;
      row.getCell('profit').numFmt = USD_FORMAT;
      row.getCell('margin').numFmt = '0.0%';
      row.getCell('barcode').alignment = { horizontal: 'left' };
    });

    styleSheet(sheet);
  }

  private addCategories(workbook: ExcelJS.Workbook, p: ExportPayload): void {
    const sheet = workbook.addWorksheet('By Category');
    sheet.columns = [
      { header: 'Category', key: 'category', width: 24 },
      { header: 'Quantity sold', key: 'qty', width: 14 },
      { header: 'Revenue', key: 'revenue', width: 14 },
      { header: 'Profit', key: 'profit', width: 14 },
      { header: 'Share of sales', key: 'share', width: 14 },
    ];

    const totalRevenue = p.byCategory.reduce((sum, c) => sum + c.revenue_cents, 0);

    for (const item of p.byCategory) {
      const row = sheet.addRow({
        category: item.category_name,
        qty: item.quantity_sold,
        revenue: cents(item.revenue_cents),
        profit: cents(item.profit_cents),
        share: totalRevenue ? item.revenue_cents / totalRevenue : 0,
      });
      row.getCell('qty').numFmt = QTY_FORMAT;
      row.getCell('revenue').numFmt = USD_FORMAT;
      row.getCell('profit').numFmt = USD_FORMAT;
      row.getCell('share').numFmt = '0.0%';
    }

    styleSheet(sheet);
  }

  private addSales(workbook: ExcelJS.Workbook, p: ExportPayload): void {
    const sheet = workbook.addWorksheet('Sales');
    sheet.columns = [
      { header: 'Date and time', key: 'when', width: 18 },
      { header: 'Sale ref', key: 'ref', width: 12 },
      { header: 'Items', key: 'items', width: 9 },
      { header: 'Subtotal', key: 'subtotal', width: 13 },
      { header: 'Discount', key: 'discount', width: 13 },
      { header: 'Discount type', key: 'dtype', width: 14 },
      { header: 'Total', key: 'total', width: 13 },
      { header: 'Total (LBP)', key: 'lbp', width: 16 },
      { header: 'Paid in', key: 'paid', width: 10 },
      { header: 'Cost', key: 'cost', width: 13 },
      { header: 'Profit', key: 'profit', width: 13 },
      { header: 'Note', key: 'note', width: 24 },
    ];

    for (const sale of p.sales) {
      const row = sheet.addRow({
        when: new Date(sale.sold_at),
        ref: sale.id.slice(0, 8),
        items: sale.item_count,
        subtotal: cents(sale.subtotal_cents),
        discount: cents(sale.discount_cents),
        dtype: describeDiscount(sale.discount_type, sale.discount_value),
        total: cents(sale.total_cents),
        lbp: sale.total_lbp,
        paid: sale.payment_currency,
        cost: cents(sale.total_cost_cents),
        profit: cents(sale.profit_cents),
        note: sale.note ?? '',
      });
      row.getCell('when').numFmt = DATE_FORMAT;
      row.getCell('items').numFmt = QTY_FORMAT;
      for (const key of ['subtotal', 'discount', 'total', 'cost', 'profit']) {
        row.getCell(key).numFmt = USD_FORMAT;
      }
      row.getCell('lbp').numFmt = LBP_FORMAT;
    }

    styleSheet(sheet);
  }

  private addLines(workbook: ExcelJS.Workbook, p: ExportPayload): void {
    const sheet = workbook.addWorksheet('Items Sold');
    sheet.columns = [
      { header: 'Date and time', key: 'when', width: 18 },
      { header: 'Sale ref', key: 'ref', width: 12 },
      { header: 'Product', key: 'name', width: 32 },
      { header: 'Barcode', key: 'barcode', width: 18 },
      { header: 'Category', key: 'category', width: 18 },
      { header: 'Quantity', key: 'qty', width: 11 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Unit price', key: 'price', width: 13 },
      { header: 'Unit cost', key: 'ucost', width: 13 },
      { header: 'Line total', key: 'gross', width: 13 },
      { header: 'After discount', key: 'net', width: 15 },
      { header: 'Profit', key: 'profit', width: 13 },
    ];

    for (const line of p.lines) {
      const row = sheet.addRow({
        when: new Date(line.sold_at),
        ref: line.sale_id.slice(0, 8),
        name: line.product_name,
        barcode: line.barcode ?? '',
        category: line.category_name,
        qty: line.quantity,
        unit: line.unit,
        price: cents(line.unit_price_cents),
        ucost: cents(line.unit_cost_cents),
        gross: cents(line.gross_cents),
        net: cents(line.net_cents),
        profit: cents(line.net_profit_cents),
      });
      row.getCell('when').numFmt = DATE_FORMAT;
      row.getCell('qty').numFmt = QTY_FORMAT;
      for (const key of ['price', 'ucost', 'gross', 'net', 'profit']) {
        row.getCell(key).numFmt = USD_FORMAT;
      }
      row.getCell('barcode').alignment = { horizontal: 'left' };
    }

    styleSheet(sheet);
  }

  private addLowStock(workbook: ExcelJS.Workbook, p: ExportPayload): void {
    const sheet = workbook.addWorksheet('Low Stock');
    sheet.columns = [
      { header: 'Product', key: 'name', width: 32 },
      { header: 'Barcode', key: 'barcode', width: 18 },
      { header: 'Category', key: 'category', width: 18 },
      { header: 'In stock', key: 'stock', width: 12 },
      { header: 'Alert level', key: 'threshold', width: 12 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Status', key: 'status', width: 14 },
    ];

    for (const item of p.lowStock) {
      const row = sheet.addRow({
        name: item.product_name,
        barcode: item.barcode ?? '',
        category: item.category_name ?? 'Uncategorised',
        stock: item.stock,
        threshold: item.threshold,
        unit: item.unit,
        status: item.stock <= 0 ? 'Out of stock' : 'Running low',
      });
      row.getCell('stock').numFmt = QTY_FORMAT;
      row.getCell('threshold').numFmt = QTY_FORMAT;
      if (item.stock <= 0) {
        row.getCell('status').font = { bold: true, color: { argb: 'FFB91C1C' } };
      }
    }

    styleSheet(sheet);
  }
}

function describeDiscount(type: string, value: number): string {
  if (type === 'percent') return `${value}% off`;
  if (type === 'amount') return `${value.toFixed(2)} off`;
  return '';
}
