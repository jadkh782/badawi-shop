import { Barcode, type Product } from '@/domain';
import type { IProductReader } from '../ports';

/**
 * Resolves a scanned code to an article.
 *
 * Returns null rather than throwing when nothing matches: an unrecognised barcode is a
 * normal event at the till, and the answer is to offer to add the product, not to raise an
 * error at the cashier.
 */
export class FindProductByBarcode {
  constructor(private readonly products: IProductReader) {}

  async execute(rawBarcode: string): Promise<Product | null> {
    const barcode = Barcode.tryCreate(rawBarcode);
    if (!barcode) return null;
    return this.products.findByBarcode(barcode);
  }
}
