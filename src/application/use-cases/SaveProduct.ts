import { DomainError, Money, Product } from '@/domain';
import type { IProductWriter, ProductDraft, RestockFunding } from '../ports';

/** What the inventory form collects, before it is turned into a stored record. */
export interface ProductFormInput {
  barcode: string;
  name: string;
  categoryId: string | null;
  costPrice: string;
  salePrice: string;
  quantity: string;
  lowStockThreshold: string;
  unit: string;
  notes: string;
  /**
   * The size and taste, on shelves that come in sizes. The stored name is assembled from
   * these and the brand, so the catalogue never ends up holding two spellings of one thing.
   */
  variantSize: string;
  variantTrait: string;
  /**
   * Who paid for the opening stock.
   *
   * Only asked when an article is created holding stock, because that is the only time this
   * form spends money. Editing an article afterwards never does.
   */
  funding: RestockFunding;
}

/**
 * Validates the inventory form and saves it.
 *
 * Validation lives here rather than in the React component so that the same rules apply
 * however a product is created, and so they can be tested without rendering anything.
 */
export class SaveProduct {
  constructor(private readonly products: IProductWriter) {}

  static toDraft(input: ProductFormInput): ProductDraft {
    const name = input.name.trim();
    if (name.length === 0) {
      throw new DomainError('Give the article a name');
    }

    const costPrice = Money.fromInput(input.costPrice);
    const salePrice = Money.fromInput(input.salePrice);
    if (costPrice.isNegative() || salePrice.isNegative()) {
      throw new DomainError('Prices cannot be negative');
    }

    const quantity = Number(input.quantity.replace(',', '.') || 0);
    const threshold = Number(input.lowStockThreshold.replace(',', '.') || 0);
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new DomainError('Quantity in stock must be zero or more');
    }
    if (!Number.isFinite(threshold) || threshold < 0) {
      throw new DomainError('The low-stock level must be zero or more');
    }

    const size = input.variantSize?.trim() ?? '';
    const trait = input.variantTrait?.trim() ?? '';
    // On a shelf that names things from parts, the Name box holds the brand. Everywhere else
    // it holds the whole name and the other two are empty, which assembles back to itself.
    const base = name;
    const hasParts = size !== '' || trait !== '';

    return {
      barcode: input.barcode.trim() === '' ? null : input.barcode.trim(),
      // Assembled here rather than in the component, so an article created from the till,
      // from a scan or from a test all end up named the same way.
      name: Product.assembleName(base, trait, size),
      variantSize: size === '' ? null : size,
      variantTrait: trait === '' ? null : trait,
      // Only recorded when it is genuinely one part of three. An ordinary article is its
      // name, and storing that twice would be two things to keep in step.
      variantBase: hasParts ? base : null,
      categoryId: input.categoryId,
      costPriceCents: costPrice.cents,
      salePriceCents: salePrice.cents,
      quantityInStock: quantity,
      lowStockThreshold: threshold,
      unit: input.unit.trim() === '' ? 'piece' : input.unit.trim(),
      notes: input.notes.trim() === '' ? null : input.notes.trim(),
      funding: input.funding ?? 'budget',
    };
  }

  /** What the opening stock will cost, which is what the form warns about before saving. */
  static openingCost(input: ProductFormInput): Money {
    try {
      const quantity = Number(input.quantity.replace(',', '.') || 0);
      if (!Number.isFinite(quantity) || quantity <= 0) return Money.zero();
      return Money.fromInput(input.costPrice).multiply(quantity);
    } catch {
      return Money.zero();
    }
  }

  async create(input: ProductFormInput): Promise<Product> {
    return this.products.create(SaveProduct.toDraft(input));
  }

  async update(id: string, input: ProductFormInput): Promise<Product> {
    return this.products.update(id, SaveProduct.toDraft(input));
  }
}
