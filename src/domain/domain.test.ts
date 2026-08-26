import { describe, expect, it } from 'vitest';
import { Money } from './value-objects/Money';
import { Quantity } from './value-objects/Quantity';
import { Barcode } from './value-objects/Barcode';
import { ExchangeRate } from './value-objects/ExchangeRate';
import { DateRange } from './value-objects/DateRange';
import { Product } from './entities/Product';
import { Cart } from './entities/Cart';
import { NoDiscount } from './discounts/NoDiscount';
import { PercentageDiscount } from './discounts/PercentageDiscount';
import { FixedAmountDiscount } from './discounts/FixedAmountDiscount';
import { DiscountFactory } from './discounts/DiscountFactory';
import { DomainError } from './errors/DomainError';

interface ProductOverrides {
  id?: string;
  cost?: number;
  price?: number;
  stock?: number;
  low?: number;
}

function makeProduct(o: ProductOverrides = {}): Product {
  return new Product({
    id: o.id ?? 'p1',
    barcode: Barcode.create('5901234123457'),
    name: 'Test Item',
    categoryId: 'c1',
    categoryName: 'Drinks',
    costPrice: Money.fromDollars(o.cost ?? 1),
    salePrice: Money.fromDollars(o.price ?? 2.5),
    stock: Quantity.of(o.stock ?? 10),
    lowStockThreshold: Quantity.of(o.low ?? 3),
    unit: 'piece',
    notes: null,
    isActive: true,
  });
}

describe('Money', () => {
  it('holds cents as integers and never drifts on repeated addition', () => {
    const a = Money.fromDollars(0.1);
    const b = Money.fromDollars(0.2);
    expect(a.add(b).cents).toBe(30);
    expect(a.add(b).equals(Money.fromDollars(0.3))).toBe(true);
  });

  it('sums a long list of awkward prices exactly', () => {
    const prices = Array.from({ length: 100 }, () => Money.fromDollars(0.07));
    expect(Money.sum(prices).cents).toBe(700);
  });

  it('parses cashier input with symbols, commas and blanks', () => {
    expect(Money.fromInput('$12.50').cents).toBe(1250);
    expect(Money.fromInput('12,50').cents).toBe(1250);
    expect(Money.fromInput('7').cents).toBe(700);
    expect(Money.fromInput('').cents).toBe(0);
  });

  it('rejects input that is not a number at all', () => {
    expect(() => Money.fromInput('12.3.4')).toThrow(DomainError);
  });

  it('multiplies by a fractional quantity and rounds to the nearest cent', () => {
    expect(Money.fromDollars(3.33).multiply(3).cents).toBe(999);
    expect(Money.fromDollars(2).multiply(0.75).cents).toBe(150);
  });

  it('caps at a maximum and clamps at zero', () => {
    expect(Money.fromDollars(50).atMost(Money.fromDollars(10)).cents).toBe(1000);
    expect(Money.fromDollars(-5).clampToZero().cents).toBe(0);
  });

  it('formats with thousands separators and two decimals', () => {
    expect(Money.fromCents(123456).format()).toBe('$1,234.56');
    expect(Money.fromCents(5).format()).toBe('$0.05');
    expect(Money.fromCents(-250).format()).toBe('-$2.50');
  });
});

describe('Quantity', () => {
  it('supports fractional amounts for goods sold by weight', () => {
    expect(Quantity.of(0.75).value).toBe(0.75);
    expect(Quantity.of(0.1).add(Quantity.of(0.2)).value).toBe(0.3);
  });

  it('rounds beyond three decimal places', () => {
    expect(Quantity.of(1.23456).value).toBe(1.235);
  });

  it('rejects values that are not finite', () => {
    expect(() => Quantity.of(Number.NaN)).toThrow(DomainError);
  });
});

describe('Barcode', () => {
  it('normalises stray whitespace from a scan', () => {
    expect(Barcode.create('  590 1234 123457 ').value).toBe('5901234123457');
  });

  it('refuses an empty code but tolerates one when optional', () => {
    expect(() => Barcode.create('   ')).toThrow(DomainError);
    expect(Barcode.tryCreate('')).toBeNull();
    expect(Barcode.tryCreate(null)).toBeNull();
  });
});

describe('ExchangeRate', () => {
  const rate = ExchangeRate.create(89000, 1000);

  it('converts USD to LBP and rounds to the configured step', () => {
    expect(rate.toLbp(Money.fromDollars(1))).toBe(89000);
    // 2.50 x 89000 = 222,500, which rounds up to the nearest 1,000
    expect(rate.toLbp(Money.fromDollars(2.5))).toBe(223000);
  });

  it('formats with thousands separators', () => {
    expect(rate.formatLbp(Money.fromDollars(10))).toBe('890,000 L.L.');
  });

  it('rejects a zero or negative rate', () => {
    expect(() => ExchangeRate.create(0)).toThrow(DomainError);
    expect(() => ExchangeRate.create(-1)).toThrow(DomainError);
  });
});

describe('discount strategies', () => {
  const subtotal = Money.fromDollars(80);

  it('applies no discount by default without any null handling', () => {
    expect(new NoDiscount().computeDiscount().cents).toBe(0);
  });

  it('takes a percentage off', () => {
    expect(new PercentageDiscount(10).computeDiscount(subtotal).cents).toBe(800);
    expect(new PercentageDiscount(12.5).computeDiscount(subtotal).cents).toBe(1000);
  });

  it('takes a flat amount off', () => {
    expect(new FixedAmountDiscount(5.5).computeDiscount(subtotal).cents).toBe(550);
  });

  it('never lets a fixed discount exceed the subtotal', () => {
    expect(new FixedAmountDiscount(500).computeDiscount(subtotal).cents).toBe(8000);
  });

  it('rejects a percentage outside 0 to 100 and a negative amount', () => {
    expect(() => new PercentageDiscount(101)).toThrow(DomainError);
    expect(() => new PercentageDiscount(-1)).toThrow(DomainError);
    expect(() => new FixedAmountDiscount(-1)).toThrow(DomainError);
  });

  it('rebuilds the right strategy from a stored type', () => {
    expect(DiscountFactory.create('percent', 10)).toBeInstanceOf(PercentageDiscount);
    expect(DiscountFactory.create('amount', 10)).toBeInstanceOf(FixedAmountDiscount);
    expect(DiscountFactory.create('none', 0)).toBeInstanceOf(NoDiscount);
  });
});

describe('Product', () => {
  it('computes unit profit and margin', () => {
    const product = makeProduct({ cost: 1, price: 2.5 });
    expect(product.unitProfit.cents).toBe(150);
    expect(product.marginPercent).toBeCloseTo(60, 5);
  });

  it('flags low stock without flagging an empty shelf as merely low', () => {
    expect(makeProduct({ stock: 3, low: 3 }).isLowStock).toBe(true);
    expect(makeProduct({ stock: 4, low: 3 }).isLowStock).toBe(false);
    const empty = makeProduct({ stock: 0, low: 3 });
    expect(empty.isLowStock).toBe(false);
    expect(empty.isOutOfStock).toBe(true);
  });

  it('spots an item priced below cost', () => {
    expect(makeProduct({ cost: 5, price: 4 }).isSoldAtLoss).toBe(true);
  });
});

describe('Cart', () => {
  it('starts empty with zero totals', () => {
    const cart = Cart.empty();
    expect(cart.isEmpty).toBe(true);
    expect(cart.total.cents).toBe(0);
    expect(cart.discountAmount.cents).toBe(0);
  });

  it('merges a rescanned item into one line instead of duplicating it', () => {
    const product = makeProduct();
    const cart = Cart.empty().add(product).add(product).add(product);
    expect(cart.lineCount).toBe(1);
    expect(cart.itemCount).toBe(3);
    expect(cart.subtotal.cents).toBe(750);
  });

  it('keeps separate products on separate lines', () => {
    const cart = Cart.empty()
      .add(makeProduct({ id: 'a', price: 2 }))
      .add(makeProduct({ id: 'b', price: 3 }));
    expect(cart.lineCount).toBe(2);
    expect(cart.subtotal.cents).toBe(500);
  });

  it('removes a line when its quantity is stepped down to zero', () => {
    const cart = Cart.empty().add(makeProduct()).decrement('p1');
    expect(cart.isEmpty).toBe(true);
  });

  it('applies a percentage discount to the subtotal', () => {
    const cart = Cart.empty()
      .add(makeProduct({ price: 10 }), Quantity.of(4))
      .withDiscount(new PercentageDiscount(25));
    expect(cart.subtotal.cents).toBe(4000);
    expect(cart.discountAmount.cents).toBe(1000);
    expect(cart.total.cents).toBe(3000);
  });

  it('absorbs the discount out of profit, not out of cost', () => {
    const cart = Cart.empty()
      .add(makeProduct({ cost: 6, price: 10 }), Quantity.of(2))
      .withDiscount(new FixedAmountDiscount(4));
    expect(cart.subtotal.cents).toBe(2000);
    expect(cart.totalCost.cents).toBe(1200);
    expect(cart.total.cents).toBe(1600);
    expect(cart.profit.cents).toBe(400);
  });

  it('never goes negative even with an oversized discount', () => {
    const cart = Cart.empty()
      .add(makeProduct({ price: 5 }))
      .withDiscount(new FixedAmountDiscount(999));
    expect(cart.total.cents).toBe(0);
  });

  it('reports lines that ask for more than the shelf holds', () => {
    const cart = Cart.empty().add(makeProduct({ stock: 2 }), Quantity.of(5));
    expect(cart.overstockedLines).toHaveLength(1);
  });

  it('does not mutate the cart it was derived from', () => {
    const first = Cart.empty().add(makeProduct());
    const second = first.add(makeProduct({ id: 'other' }));
    expect(first.lineCount).toBe(1);
    expect(second.lineCount).toBe(2);
  });
});

describe('DateRange', () => {
  it('covers exactly one day for today', () => {
    const range = DateRange.today(new Date(2026, 7, 25, 14, 30));
    expect(range.from.getDate()).toBe(25);
    expect(range.to.getDate()).toBe(26);
    expect(range.days).toBe(1);
  });

  it('starts the week on Monday', () => {
    const range = DateRange.thisWeek(new Date(2026, 7, 25));
    expect(range.from.getDate()).toBe(24);
    expect(range.days).toBe(7);
  });

  it('covers a whole calendar month', () => {
    const range = DateRange.thisMonth(new Date(2026, 1, 10));
    expect(range.from.getMonth()).toBe(1);
    expect(range.days).toBe(28);
  });

  it('makes the end date inclusive of its whole day', () => {
    expect(DateRange.fromDateStrings('2026-08-01', '2026-08-31').days).toBe(31);
  });

  it('rejects a range that ends before it starts', () => {
    expect(() => DateRange.fromDateStrings('2026-08-31', '2026-08-01')).toThrow(DomainError);
  });
});
