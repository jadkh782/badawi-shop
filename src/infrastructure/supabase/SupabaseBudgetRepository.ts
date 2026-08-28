import type { SupabaseClient } from '@supabase/supabase-js';
import { BudgetSummary, CashMovement, Money, type CashKind } from '@/domain';
import type { IBudgetRepository, IShopReset, ResetCounts } from '@/application/ports';
import { translateError } from './errors';
import { num } from './types';

interface BudgetRow {
  balance_cents: number;
  from_sales_cents: number;
  spent_restock_cents: number;
  invested_cents: number;
  entry_count: number;
}

interface MovementRow {
  id: string;
  kind: CashKind;
  amount_cents: number;
  product_name: string | null;
  note: string | null;
  created_at: string;
}

export class SupabaseBudgetRepository implements IBudgetRepository {
  constructor(private readonly db: SupabaseClient) {}

  async summary(): Promise<BudgetSummary> {
    const { data, error } = await this.db.rpc('report_budget');
    if (error) throw translateError(error);

    const row = (data as BudgetRow[])[0];
    if (!row) return BudgetSummary.empty();

    return new BudgetSummary(
      Money.fromCents(num(row.balance_cents)),
      Money.fromCents(num(row.from_sales_cents)),
      Money.fromCents(num(row.spent_restock_cents)),
      Money.fromCents(num(row.invested_cents)),
      num(row.entry_count),
    );
  }

  async movements(limit = 100): Promise<CashMovement[]> {
    const { data, error } = await this.db.rpc('list_cash_movements', { p_limit: limit });
    if (error) throw translateError(error);

    return (data as MovementRow[]).map(
      (row) =>
        new CashMovement(
          row.id,
          row.kind,
          Money.fromCents(num(row.amount_cents)),
          row.product_name,
          row.note,
          new Date(row.created_at),
        ),
    );
  }
}

/** Kept apart from everything that writes routinely, because this one has no undo. */
export class SupabaseShopReset implements IShopReset {
  constructor(private readonly db: SupabaseClient) {}

  async reset(confirmation: string): Promise<ResetCounts> {
    const { data, error } = await this.db.rpc('reset_shop', { p_confirm: confirmation });
    if (error) throw translateError(error);

    const counts = (data ?? {}) as Record<string, number>;
    return {
      sales: num(counts.sales),
      saleItems: num(counts.sale_items),
      stockMovements: num(counts.stock),
      cashMovements: num(counts.cash),
      products: num(counts.products),
      categories: num(counts.categories),
    };
  }
}
