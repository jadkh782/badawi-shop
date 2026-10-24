import type { BudgetSummary, CashMovement, InventoryValue } from '@/domain';

/** Money leaving the drawer for something that is not stock. */
export type PayOutKind = 'expense' | 'drawing';

export interface PayOutResult {
  amountCents: number;
  /** What is left afterwards, so the screen can say so without asking again. */
  balanceCents: number;
}

export interface IBudgetRepository {
  summary(): Promise<BudgetSummary>;
  movements(limit?: number): Promise<CashMovement[]>;
  /** What the shelves are holding, which is the other half of what the shop is worth. */
  inventoryValue(): Promise<InventoryValue>;
  /**
   * Records a payment out of the drawer. The amount is positive, as it is read off a bill;
   * which direction it moves the balance is not the caller's to decide.
   */
  payOut(kind: PayOutKind, amountCents: number, note?: string | null): Promise<PayOutResult>;
}
