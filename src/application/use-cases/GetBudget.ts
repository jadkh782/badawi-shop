import type { BudgetSummary, CashMovement } from '@/domain';
import type { IBudgetRepository } from '../ports';

export interface BudgetView {
  summary: BudgetSummary;
  movements: CashMovement[];
}

/** Loads the balance and the entries behind it together. */
export class GetBudget {
  constructor(private readonly budget: IBudgetRepository) {}

  async execute(limit = 100): Promise<BudgetView> {
    const [summary, movements] = await Promise.all([
      this.budget.summary(),
      this.budget.movements(limit),
    ]);
    return { summary, movements };
  }
}
