import { DomainError } from '../errors/DomainError';

/**
 * A count of stock. Fractional to three places so goods sold by weight (0.750 kg) behave the
 * same way as goods sold by the piece.
 */
export class Quantity {
  private static readonly PRECISION = 1000;

  private constructor(private readonly _units: number) {}

  static of(value: number): Quantity {
    if (!Number.isFinite(value)) {
      throw new DomainError(`Quantity must be a finite number, got ${value}`);
    }
    return new Quantity(Math.round(value * Quantity.PRECISION) / Quantity.PRECISION);
  }

  static zero(): Quantity {
    return new Quantity(0);
  }

  static one(): Quantity {
    return new Quantity(1);
  }

  get value(): number {
    return this._units;
  }

  add(other: Quantity): Quantity {
    return Quantity.of(this._units + other._units);
  }

  subtract(other: Quantity): Quantity {
    return Quantity.of(this._units - other._units);
  }

  isZero(): boolean {
    return this._units === 0;
  }

  isPositive(): boolean {
    return this._units > 0;
  }

  greaterThan(other: Quantity): boolean {
    return this._units > other._units;
  }

  lessThanOrEqual(other: Quantity): boolean {
    return this._units <= other._units;
  }

  /** Renders without trailing zeroes, so a count of pieces reads 3 rather than 3.000. */
  format(): string {
    return String(this._units);
  }

  toString(): string {
    return this.format();
  }
}
