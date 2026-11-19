import { describe, expect, it } from 'vitest';
import { Barcode, Money, Product, Quantity, type ShopSettings } from '@/domain';
import type { IReceiptPrinter, PrintJob, PrintOutcome } from '@/application/ports';
import { ReceiptPrinting } from './ReceiptPrinting';
import { LABEL_HEIGHT_MM, LABEL_WIDTH_MM } from './LabelDocument';

/** Catches the job instead of printing it, so the paper can be inspected. */
class Spool implements IReceiptPrinter {
  readonly name = 'Spool';
  readonly jobs: PrintJob[] = [];

  async print(job: PrintJob): Promise<PrintOutcome> {
    this.jobs.push(job);
    return 'printed';
  }
}

const product = (over: Partial<{ name: string; barcode: string | null }> = {}) =>
  new Product({
    id: 'p1',
    barcode: over.barcode === null ? null : Barcode.create(over.barcode ?? '4033100059919'),
    name: over.name ?? 'NAKHLE TEFEH 50G',
    categoryId: null,
    categoryName: 'M3ASAL',
    costPrice: Money.fromCents(150),
    salePrice: Money.fromCents(278),
    stock: Quantity.of(4),
    lowStockThreshold: Quantity.of(1),
    unit: 'piece',
    notes: null,
    isActive: true,
  });

const settings = { shopName: 'BEIT BADAWI' } as ShopSettings;

describe('which paper a job is for', () => {
  /*
    This is the whole reason the field exists. The till app does not read the document's
    @page rule — Electron's print takes the page from the printer's stored settings — so a
    label that says nothing here is laid out on whatever that happens to be. It was a Letter
    sheet, and every label came out blank with the real one in a corner of it.
  */
  it('tells the printer the size of a label, since the document cannot', async () => {
    const spool = new Spool();
    await new ReceiptPrinting(spool).label(product(), settings);

    expect(spool.jobs[0]?.pageSizeMm).toEqual({
      widthMm: LABEL_WIDTH_MM,
      heightMm: LABEL_HEIGHT_MM,
    });
  });

  it('sends a label to the label printer rather than the till roll', async () => {
    const spool = new Spool();
    await new ReceiptPrinting(spool).label(product(), settings);

    expect(spool.jobs[0]?.destination).toBe('label');
  });

  it('leaves a scan sheet to the dialog, whose paper is the operator to choose', async () => {
    const spool = new Spool();
    await new ReceiptPrinting(spool).scanSheet([product()], settings);

    expect(spool.jobs[0]?.destination).toBe('ask');
    expect(spool.jobs[0]?.pageSizeMm).toBeUndefined();
  });

  it('prints one label per copy asked for', async () => {
    const spool = new Spool();
    await new ReceiptPrinting(spool).label(product(), settings, 3);

    expect(spool.jobs[0]?.html.match(/class="label"/g)).toHaveLength(3);
  });

  it('says so rather than printing nothing when an article has no barcode', async () => {
    const spool = new Spool();
    const outcome = await new ReceiptPrinting(spool).label(product({ barcode: null }), settings);

    expect(outcome).toBe('unavailable');
    expect(spool.jobs).toHaveLength(0);
  });
});
