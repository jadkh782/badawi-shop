import { DomainError } from '../errors/DomainError';

/**
 * An amount of money held as an integer number of minor units (USD cents).
 *
 * Prices are never stored or computed as floating point: `0.1 + 0.2 !== 0.3` is not an
 * acceptable property for a till. Every operation returns a new instance, so a Money value
 * can be shared freely without defensive copying.
 */
export class Money {
  private constructor(private readonly _cents: number) {
    if (!Number.isInteger(_cents)) {
      throw new DomainError(`Money must be a whole number of cents, got ${_cents}`);
    }
  }

  static fromCents(cents: number): Money {
    return new Money(Math.round(cents));
  }

  /** Parses user input such as "12.5", "12,50" or "$12.50". */
  static fromInput(input: string | number): Money {
    if (typeof input === 'number') return Money.fromDollars(input);
    const cleaned = input.replace(/[^0-9.,-]/g, '').replace(',', '.');
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return Money.zero();
    const parsed = Number(cleaned);
    if (Number.isNaN(parsed)) {
      throw new DomainError(`"${input}" is not a valid amount`);
    }
    return Money.fromDollars(parsed);
  }

  static fromDollars(dollars: number): Money {
    return new Money(Math.round(dollars * 100));
  }

  static zero(): Money {
    return new Money(0);
  }

  get cents(): number {
    return this._cents;
  }

  get dollars(): number {
    return this._cents / 100;
  }

  add(other: Money): Money {
    return new Money(this._cents + other._cents);
  }

  subtract(other: Money): Money {
    return new Money(this._cents - other._cents);
  }

  /** Multiplies by a quantity, which may be fractional for goods sold by weight. */
  multiply(factor: number): Money {
    return new Money(Math.round(this._cents * factor));
  }

  /** `percent` is expressed as a whole number: `percentage(10)` is 10%. */
  percentage(percent: number): Money {
    return new Money(Math.round((this._cents * percent) / 100));
  }

  /** Clamps at zero. A discount can never turn a sale into a payout. */
  clampToZero(): Money {
    return this._cents < 0 ? Money.zero() : this;
  }

  /** Caps the value at `max`, used to stop a fixed discount exceeding the subtotal. */
  atMost(max: Money): Money {
    return this._cents > max._cents ? max : this;
  }

  isZero(): boolean {
    return this._cents === 0;
  }

  isNegative(): boolean {
    return this._cents < 0;
  }

  greaterThan(other: Money): boolean {
    return this._cents > other._cents;
  }

  greaterThanOrEqual(other: Money): boolean {
    return this._cents >= other._cents;
  }

  equals(other: Money): boolean {
    return this._cents === other._cents;
  }

  static sum(amounts: readonly Money[]): Money {
    return amounts.reduce<Money>((acc, m) => acc.add(m), Money.zero());
  }

  format(): string {
    const sign = this._cents < 0 ? '-' : '';
    const abs = Math.abs(this._cents);
    const whole = Math.floor(abs / 100).toLocaleString('en-US');
    const fraction = String(abs % 100).padStart(2, '0');
    return `${sign}$${whole}.${fraction}`;
  }

  toString(): string {
    return this.format();
  }
}
