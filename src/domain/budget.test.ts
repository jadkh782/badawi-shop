import { describe, expect, it } from 'vitest';
import { BudgetSummary, CashMovement, Money } from '@/domain';

const $ = (dollars: number) => Money.fromDollars(dollars);

function box(over: Partial<Record<string, Money>> = {}): BudgetSummary {
  const z = Money.zero();
  return new BudgetSummary(
    over.balance ?? z,
    over.fromSales ?? z,
    over.spentOnRestock ?? z,
    over.spentOnOpening ?? z,
    over.investedFromOutside ?? z,
    over.corrections ?? z,
    over.refunded ?? z,
    over.voided ?? z,
    over.removed ?? z,
    over.expenses ?? z,
    over.drawings ?? z,
    0,
  );
}

describe('what the shop has actually earned', () => {
  it('sets aside money put in from outside', () => {
    const summary = box({ balance: $(1000), investedFromOutside: $(400) });
    expect(summary.earned.format()).toBe('$600.00');
  });

  it('adds back what the owner has taken out', () => {
    // The shop earned the $1000 and then handed $300 over. Leaving it out would make a shop
    // that pays its owner well look like one barely breaking even.
    const summary = box({ balance: $(700), drawings: $(300) });
    expect(summary.earned.format()).toBe('$1,000.00');
  });

  it('does not add back running costs, because rent is a cost of earning anything', () => {
    const summary = box({ balance: $(700), expenses: $(300) });
    expect(summary.earned.format()).toBe('$700.00');
  });

  it('handles both at once', () => {
    const summary = box({
      balance: $(500),
      investedFromOutside: $(200),
      drawings: $(400),
      expenses: $(100),
    });
    // 500 - 200 + 400 = 700. The expenses already sit inside the balance and stay there.
    expect(summary.earned.format()).toBe('$700.00');
  });

  it('knows when it is overdrawn', () => {
    expect(box({ balance: $(-50) }).isOverdrawn).toBe(true);
    expect(box({ balance: $(0) }).isOverdrawn).toBe(false);
  });
});

describe('reading a ledger line back', () => {
  const line = (kind: 'expense' | 'drawing', note: string | null) =>
    new CashMovement('1', kind, $(-100), null, note, new Date());

  it('says what a running cost was for', () => {
    expect(line('expense', 'Rent').describe()).toBe('Expense, Rent');
  });

  it('still reads sensibly without a note', () => {
    expect(line('expense', null).describe()).toBe('Expense');
    expect(line('drawing', null).describe()).toBe('Paid to owner');
  });

  it('names the owner payment as such rather than as a cost', () => {
    expect(line('drawing', 'October').describe()).toBe('Paid to owner, October');
  });

  it('counts both as money leaving', () => {
    expect(line('expense', null).isMoneyIn).toBe(false);
    expect(line('drawing', null).isMoneyIn).toBe(false);
  });
});
