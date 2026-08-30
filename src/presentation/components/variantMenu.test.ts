import { describe, expect, it } from 'vitest';
import { Money, Product, Quantity } from '@/domain';
import { buildVariantMenu, sizeInGrams, stockAcross } from './variantMenu';

function article(
  id: string,
  base: string | null,
  trait: string | null,
  size: string | null,
  stock = 5,
): Product {
  return new Product({
    id,
    barcode: null,
    name: [base, trait, size].filter(Boolean).join(' ') || id,
    categoryId: 'tobacco',
    categoryName: 'Tobacco',
    costPrice: Money.fromDollars(5),
    salePrice: Money.fromDollars(9),
    stock: Quantity.of(stock),
    lowStockThreshold: Quantity.of(1),
    unit: 'piece',
    notes: null,
    isActive: true,
    variantBase: base,
    variantTrait: trait,
    variantSize: size,
  });
}

const shelf = [
  article('a', 'Al Fakher', 'Double Apple', '50g', 3),
  article('b', 'Al Fakher', 'Double Apple', '250g', 4),
  article('c', 'Al Fakher', 'Double Apple', '1kg', 0),
  article('d', 'Al Fakher', 'Mint', '250g', 6),
  article('e', 'Adalya', 'Love 66', '50g', 2),
  article('f', null, null, null, 9), // a lighter, say: on the shelf but not one of a family
];

describe('the three step menu the till walks', () => {
  it('offers brands at the top, not sixty articles', () => {
    const { brands } = buildVariantMenu(shelf, null, null);
    expect(brands.map((g) => g.label)).toEqual(['Adalya', 'Al Fakher']);
  });

  it('counts the whole family behind a brand', () => {
    const { brands } = buildVariantMenu(shelf, null, null);
    const fakher = brands.find((g) => g.label === 'Al Fakher');
    expect(fakher?.items).toHaveLength(4);
    expect(stockAcross(fakher!.items)).toBe(13);
  });

  it('keeps an article with no parts sellable in its own right', () => {
    // A shelf that comes in sizes may still hold one-off items, and burying them behind a
    // menu they do not belong to would make them unsellable.
    const { loose } = buildVariantMenu(shelf, null, null);
    expect(loose.map((p) => p.id)).toEqual(['f']);
  });

  it('narrows to the tastes of the chosen brand only', () => {
    const { tastes } = buildVariantMenu(shelf, 'Al Fakher', null);
    expect(tastes.map((g) => g.label)).toEqual(['Double Apple', 'Mint']);
  });

  it('does not leak another brand into the taste list', () => {
    const { tastes } = buildVariantMenu(shelf, 'Adalya', null);
    expect(tastes.map((g) => g.label)).toEqual(['Love 66']);
  });

  it('ends on the weights, which are the articles themselves', () => {
    const { weights } = buildVariantMenu(shelf, 'Al Fakher', 'Double Apple');
    expect(weights.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('orders weights by what they weigh, not alphabetically', () => {
    // Sorted as text this reads 1kg, 250g, 50g, which looks like a bug to anyone using it.
    const { weights } = buildVariantMenu(shelf, 'Al Fakher', 'Double Apple');
    expect(weights.map((p) => p.variantSize)).toEqual(['50g', '250g', '1kg']);
  });

  it('shows nothing until a brand has been chosen', () => {
    expect(buildVariantMenu(shelf, null, null).weights).toEqual([]);
    expect(buildVariantMenu(shelf, null, 'Mint').weights).toEqual([]);
  });

  it('groups by the stored brand, so a hand-edited name still belongs', () => {
    const edited = article('g', 'Al Fakher', 'Mint', '50g');
    const renamed = new Product({ ...edited, name: 'Completely different' });
    const { brands } = buildVariantMenu([...shelf, renamed], null, null);
    expect(brands.find((g) => g.label === 'Al Fakher')?.items).toHaveLength(5);
  });

  it('survives a brand that no longer has anything under it', () => {
    expect(buildVariantMenu(shelf, 'Nobody', null).tastes).toEqual([]);
    expect(buildVariantMenu(shelf, 'Nobody', 'Mint').weights).toEqual([]);
  });
});

describe('reading a weight off its label', () => {
  it('understands the units a shelf actually uses', () => {
    expect(sizeInGrams('50g')).toBe(50);
    expect(sizeInGrams('250 g')).toBe(250);
    expect(sizeInGrams('1kg')).toBe(1000);
    expect(sizeInGrams('1.5 KG')).toBe(1500);
  });

  it('sorts an unreadable label last rather than first', () => {
    // Last is recoverable: the real sizes stay in order and the odd one sits at the end.
    // First would push every genuine size down the screen behind it.
    expect(sizeInGrams('family pack')).toBe(Number.MAX_SAFE_INTEGER);
    expect(sizeInGrams(null)).toBe(Number.MAX_SAFE_INTEGER);
    expect(sizeInGrams('')).toBe(Number.MAX_SAFE_INTEGER);
  });
});
