/** A grouping of products. Doubles as the tap-to-sell grouping in Sell mode. */
export class Category {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly color: string,
    readonly sortOrder: number,
    readonly isActive: boolean = true,
  ) {}

  static readonly DEFAULT_COLOR = '#64748b';
}
