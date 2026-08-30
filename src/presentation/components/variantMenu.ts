import type { Product } from '@/domain';

/**
 * Turning a shelf full of articles into the three-step menu the till walks.
 *
 * Pulled out of the component because it is the part that can be wrong. Which brands exist,
 * which tastes belong to the brand in hand, and which weights are left of that taste, are
 * three questions with real answers, and answering them inside a render is where they stop
 * being checkable.
 */

export interface MenuGroup {
  /** What the tile says: a brand, or a taste. */
  label: string;
  /** The articles behind it, which is what makes the count and the stock figure. */
  items: Product[];
}

export interface VariantMenu {
  brands: MenuGroup[];
  tastes: MenuGroup[];
  weights: Product[];
  /** Articles on the shelf that were never given parts, still sellable in their own right. */
  loose: Product[];
}

/**
 * Weights in the order a shelf stocks them rather than alphabetically, which would put 1kg
 * before 50g and read as a mistake. Anything unparseable sorts last rather than first, so one
 * odd label cannot push the real sizes down the screen.
 */
export function sizeInGrams(value: string | null | undefined): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const match = /^([\d.]+)\s*(kg|g)?$/i.exec(value.trim());
  if (!match) return Number.MAX_SAFE_INTEGER;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return Number.MAX_SAFE_INTEGER;
  return match[2]?.toLowerCase() === 'kg' ? amount * 1000 : amount;
}

function bySize(a: Product, b: Product): number {
  const diff = sizeInGrams(a.variantSize) - sizeInGrams(b.variantSize);
  return diff !== 0 ? diff : (a.variantSize ?? '').localeCompare(b.variantSize ?? '');
}

function group(items: Product[], key: (p: Product) => string): MenuGroup[] {
  const map = new Map<string, Product[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return [...map.entries()]
    .map(([label, group]) => ({ label, items: group }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The menu at whatever depth the cashier has reached.
 *
 * `brand` null is the top. With a brand and no taste it is the taste list. With both it is
 * the weights, which are the articles themselves and the only tiles that go in the cart.
 */
export function buildVariantMenu(
  products: readonly Product[],
  brand: string | null,
  taste: string | null,
): VariantMenu {
  const family = products.filter((p) => p.hasVariantParts);
  const loose = products.filter((p) => !p.hasVariantParts);

  const brands = group(family, (p) => p.brandName);
  const forBrand = brand ? (brands.find((g) => g.label === brand)?.items ?? []) : [];
  const tastes = group(forBrand, (p) => p.variantTrait ?? '');

  const weights =
    brand && taste !== null
      ? (tastes.find((g) => g.label === taste)?.items ?? []).slice().sort(bySize)
      : [];

  return { brands, tastes, weights, loose };
}

/** Units left across a group, which is what tells the cashier a brand is worth opening. */
export function stockAcross(items: readonly Product[]): number {
  return items.reduce((total, item) => total + item.stock.value, 0);
}
