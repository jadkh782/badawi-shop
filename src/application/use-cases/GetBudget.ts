import type { BudgetSummary, CashMovement, InventoryValue } from '@/domain';
import type { IBudgetRepository } from '../ports';

export interface BudgetView {
  summary: BudgetSummary;
  movements: CashMovement[];
  inventory: InventoryValue;
}

/**
 * Loads the balance, the entries behind it, and what the shelves are holding.
 *
 * The stock value belongs here rather than on a screen of its own: "what can I spend" and
 * "what have I already spent that is still sitting there" are two halves of one question,
 * and answering only the first makes a well-stocked shop look broke.
 */
export class GetBudget {
  constructor(private readonly budget: IBudgetRepository) {}

  async execute(limit = 100): Promise<BudgetView> {
    const [summary, movements, inventory] = await Promise.all([
      this.budget.summary(),
      this.budget.movements(limit),
      this.budget.inventoryValue(),
    ]);
    return { summary, movements, inventory };
  }
}
