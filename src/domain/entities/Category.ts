/**
 * A grouping of products. Doubles as the tap-to-sell grouping in Sell mode.
 *
 * A shelf may also say that its articles come in sizes. Tobacco does: a brand is sold in
 * 50g, 250g and 1kg, each in several tastes, and each of those is genuinely its own article
 * with its own barcode, price and count. What the shelf provides is the vocabulary, so the
 * form can offer the sizes as buttons and name the articles consistently instead of leaving
 * it to whoever is typing.
 *
 * A shelf with no sizes behaves exactly as it always did.
 */
export class Category {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly color: string,
    readonly sortOrder: number,
    readonly isActive: boolean = true,
    /** The sizes offered on this shelf. Empty means the shelf does not work that way. */
    readonly variantSizes: readonly string[] = [],
    /** What this shelf calls its free-text part, such as "Taste". */
    readonly variantTraitLabel: string | null = null,
  ) {}

  static readonly DEFAULT_COLOR = '#64748b';

  /** Whether articles on this shelf are named from parts rather than typed out whole. */
  get hasVariants(): boolean {
    return this.variantSizes.length > 0;
  }
}
