import { DomainError } from '../errors/DomainError';
import { Money } from './Money';

/**
 * Converts the USD prices the shop keeps into the Lebanese pounds a customer may hand over.
 *
 * USD is always the source of truth: every product price, every stored sale total and every
 * profit figure is USD cents. LBP is a presentation of that number at a given rate, and the
 * rate in force is recorded on each sale so an old receipt still reconstructs correctly after
 * the rate moves.
 */
export class ExchangeRate {
  private constructor(
    /** How many LBP one USD buys. */
    readonly usdToLbp: number,
    /** LBP totals are rounded to this step, to avoid hunting for small change. */
    readonly rounding: number,
  ) {}

  static create(usdToLbp: number, rounding = 1000): ExchangeRate {
    if (!Number.isFinite(usdToLbp) || usdToLbp <= 0) {
      throw new DomainError(`Exchange rate must be a positive number, got ${usdToLbp}`);
    }
    if (!Number.isFinite(rounding) || rounding < 1) {
      throw new DomainError(`Rounding step must be at least 1, got ${rounding}`);
    }
    return new ExchangeRate(usdToLbp, Math.round(rounding));
  }

  /** Converts to whole Lebanese pounds, rounded to the configured step. */
  toLbp(amount: Money): number {
    const raw = amount.dollars * this.usdToLbp;
    return Math.round(raw / this.rounding) * this.rounding;
  }

  formatLbp(amount: Money): string {
    return `${this.toLbp(amount).toLocaleString('en-US')} L.L.`;
  }

  equals(other: ExchangeRate): boolean {
    return this.usdToLbp === other.usdToLbp && this.rounding === other.rounding;
  }
}
