import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { ExcelWorkbookBuilder } from './ExcelWorkbookBuilder';
import type { ExportPayload } from './exportTypes';

function payload(overrides: Partial<ExportPayload> = {}): ExportPayload {
  return {
    shopName: 'Badawi Shop',
    rangeLabel: '01 Aug 2026 - 31 Aug 2026',
    bucket: 'daily',
    usdToLbp: 89000,
    summary: {
      total_sales_cents: 125_000,
      total_cost_cents: 75_000,
      total_profit_cents: 50_000,
      total_discount_cents: 5_000,
      transaction_count: 40,
      items_sold: 260,
      paid_usd_cents: 80_000,
      paid_lbp_cents: 45_000,
      refunded_cents: 0,
      refund_count: 0,
      voided_cents: 0,
      voided_count: 0,
    },
    series: [
      { bucket_start: '2026-08-01T00:00:00Z', sales_cents: 60_000, profit_cents: 24_000, transaction_count: 20, items_sold: 130 },
      { bucket_start: '2026-08-02T00:00:00Z', sales_cents: 0, profit_cents: 0, transaction_count: 0, items_sold: 0 },
      { bucket_start: '2026-08-03T00:00:00Z', sales_cents: 65_000, profit_cents: 26_000, transaction_count: 20, items_sold: 130 },
    ],
    topProducts: [
      { product_name: 'Cola 1L', barcode: '5901234123457', category_name: 'Drinks', quantity_sold: 120, revenue_cents: 18_000, profit_cents: 7_200 },
      { product_name: 'Bread', barcode: null, category_name: 'Bakery', quantity_sold: 80, revenue_cents: 8_000, profit_cents: 2_400 },
    ],
    byCategory: [
      { category_name: 'Drinks', quantity_sold: 120, revenue_cents: 18_000, profit_cents: 7_200 },
      { category_name: 'Bakery', quantity_sold: 80, revenue_cents: 8_000, profit_cents: 2_400 },
    ],
    lowStock: [
      { product_name: 'Rice 1kg', barcode: '999', category_name: 'Groceries', stock: 0, threshold: 5, unit: 'piece' },
      { product_name: 'Sugar', barcode: null, category_name: 'Groceries', stock: 2, threshold: 5, unit: 'kg' },
    ],
    sales: [
      {
        id: 'a1b2c3d4-0000-0000-0000-000000000000',
        sold_at: '2026-08-01T10:30:00Z',
        subtotal_cents: 3_000, discount_type: 'percent', discount_value: 10, discount_cents: 300,
        total_cents: 2_700, total_cost_cents: 1_500, profit_cents: 1_200,
        payment_currency: 'LBP', usd_to_lbp_rate: 89_000, total_lbp: 2_403_000,
        item_count: 3, note: 'regular',
      },
    ],
    lines: [
      {
        sale_id: 'a1b2c3d4-0000-0000-0000-000000000000',
        sold_at: '2026-08-01T10:30:00Z',
        product_name: 'Cola 1L', barcode: '5901234123457', category_name: 'Drinks',
        unit: 'piece', quantity: 2, unit_price_cents: 150, unit_cost_cents: 60,
        gross_cents: 300, net_cents: 270, cost_cents: 120, net_profit_cents: 150,
      },
    ],
    ...overrides,
  };
}

/**
 * Column keys are an in-memory convenience in exceljs and are not written into the file, so
 * assertions after a round-trip address cells by their letter, exactly as Excel would.
 */
async function build(input = payload()): Promise<ExcelJS.Workbook> {
  const bytes = await new ExcelWorkbookBuilder().build(input);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
  return workbook;
}

describe('ExcelWorkbookBuilder', () => {
  it('produces a real xlsx file that reopens cleanly', async () => {
    const bytes = await new ExcelWorkbookBuilder().build(payload());
    expect(bytes.byteLength).toBeGreaterThan(2000);
    // A xlsx file is a zip, so it opens with the zip magic number.
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe('PK');
  });

  it('has every sheet the shop was promised', async () => {
    const workbook = await build();
    const names = workbook.worksheets.map((sheet) => sheet.name);
    expect(names).toEqual(['Summary', 'Day', 'Top Products', 'By Category', 'Sales', 'Items Sold', 'Low Stock']);
  });

  it('writes money as numbers in dollars, not as text', async () => {
    const workbook = await build();
    const sheet = workbook.getWorksheet('Sales');
    const total = sheet?.getRow(2).getCell('G');
    expect(typeof total?.value).toBe('number');
    expect(total?.value).toBeCloseTo(27, 6);
    expect(total?.numFmt).toContain('#,##0.00');
  });

  it('keeps the LBP total exactly as it was recorded on the sale', async () => {
    const workbook = await build();
    const cell = workbook.getWorksheet('Sales')?.getRow(2).getCell('H');
    expect(cell?.value).toBe(2_403_000);
  });

  it('writes real dates so the column can be sorted and filtered', async () => {
    const workbook = await build();
    const when = workbook.getWorksheet('Items Sold')?.getRow(2).getCell('A');
    expect(when?.value).toBeInstanceOf(Date);
  });

  it('keeps a long barcode readable instead of letting Excel mangle it', async () => {
    const workbook = await build();
    const barcode = workbook.getWorksheet('Top Products')?.getRow(2).getCell('C');
    expect(barcode?.value).toBe('5901234123457');
    expect(typeof barcode?.value).toBe('string');
  });

  it('totals the period sheet with a live formula, not a frozen number', async () => {
    const workbook = await build();
    const sheet = workbook.getWorksheet('Day');
    const totalRow = sheet?.getRow(5);
    expect(totalRow?.getCell('A').value).toBe('Total');
    expect((totalRow?.getCell('B').value as { formula?: string })?.formula).toBe('SUM(B2:B4)');
  });

  it('names the sheet after the grouping that was chosen', async () => {
    const monthly = await build(payload({ bucket: 'monthly' }));
    expect(monthly.worksheets.map((s) => s.name)).toContain('Month');
  });

  it('freezes the header row on every sheet so it survives scrolling', async () => {
    const workbook = await build();
    for (const sheet of workbook.worksheets) {
      expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    }
  });

  it('flags an empty shelf in the restocking list', async () => {
    const workbook = await build();
    const sheet = workbook.getWorksheet('Low Stock');
    expect(sheet?.getRow(2).getCell('G').value).toBe('Out of stock');
    expect(sheet?.getRow(3).getCell('G').value).toBe('Running low');
  });

  it('builds a workbook for a period with no sales at all', async () => {
    const empty = payload({
      summary: {
        total_sales_cents: 0, total_cost_cents: 0, total_profit_cents: 0, total_discount_cents: 0,
        transaction_count: 0, items_sold: 0, paid_usd_cents: 0, paid_lbp_cents: 0,
        refunded_cents: 0, refund_count: 0, voided_cents: 0, voided_count: 0,
      },
      series: [], topProducts: [], byCategory: [], lowStock: [], sales: [], lines: [],
    });
    const workbook = await build(empty);
    expect(workbook.worksheets).toHaveLength(7);
    // Dividing by a zero transaction count must not put NaN in front of the shop.
    const average = workbook.getWorksheet('Summary')?.getRow(15).getCell('B').value;
    expect(average).toBe(0);
  });
});
