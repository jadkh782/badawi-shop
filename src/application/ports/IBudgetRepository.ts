import type { BudgetSummary, CashMovement, InventoryValue } from '@/domain';

export interface IBudgetRepository {
  summary(): Promise<BudgetSummary>;
  movements(limit?: number): Promise<CashMovement[]>;
  /** What the shelves are holding, which is the other half of what the shop is worth. */
  inventoryValue(): Promise<InventoryValue>;
}
