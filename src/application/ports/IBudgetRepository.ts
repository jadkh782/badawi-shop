import type { BudgetSummary, CashMovement } from '@/domain';

export interface IBudgetRepository {
  summary(): Promise<BudgetSummary>;
  movements(limit?: number): Promise<CashMovement[]>;
}
