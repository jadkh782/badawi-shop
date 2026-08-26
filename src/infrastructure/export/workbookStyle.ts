import type { Worksheet } from 'exceljs';

/** Number formats. Values go in as real numbers so the shop can sum them themselves. */
export const USD_FORMAT = '"$"#,##0.00';
export const LBP_FORMAT = '#,##0 "L.L."';
export const QTY_FORMAT = '#,##0.###';
export const DATE_FORMAT = 'dd/mm/yyyy hh:mm';
export const DAY_FORMAT = 'dd/mm/yyyy';

const HEADER_FILL = 'FF0F172A';

/**
 * Applies the same treatment to every sheet: a dark header row that stays put while
 * scrolling, sensible column widths and a filter across the headings.
 */
export function styleSheet(sheet: Worksheet, options: { autoFilter?: boolean } = {}): void {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  header.alignment = { vertical: 'middle' };
  header.height = 22;

  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  if (options.autoFilter !== false && sheet.columnCount > 0 && sheet.rowCount > 1) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columnCount },
    };
  }
}

/** Marks the final row as a total: bold, with a line above it. */
export function markTotalRow(sheet: Worksheet, rowNumber: number): void {
  const row = sheet.getRow(rowNumber);
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } };
  });
}

export const cents = (value: number): number => value / 100;
