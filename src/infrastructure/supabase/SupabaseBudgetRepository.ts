import type { SupabaseClient } from '@supabase/supabase-js';
import { CashMovement, InventoryValue, Money, type BudgetSummary, type CashKind } from '@/domain';
import type {
  IBudgetRepository,
  IShopReset,
  PayOutKind,
  PayOutResult,
  ResetCounts,
} from '@/application/ports';
import { toBudget, toInventoryValue } from './mappers/toDomain';
import type { BudgetRow, InventoryValueRow } from './types';
import { translateError } from './errors';
import { num } from './types';

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
    return toBudget((data as BudgetRow[])[0]);
  }

  async payOut(kind: PayOutKind, amountCents: number, note?: string | null): Promise<PayOutResult> {
    const { data, error } = await this.db.rpc('pay_out', {
      p_kind: kind,
      p_amount_cents: amountCents,
      p_note: note ?? null,
    });
    if (error) throw translateError(error);

    const row = (data ?? {}) as Record<string, unknown>;
    return {
      amountCents: Number(row.amount_cents ?? amountCents),
      balanceCents: Number(row.balance_cents ?? 0),
    };
  }

  async inventoryValue(): Promise<InventoryValue> {
    const { data, error } = await this.db.rpc('report_inventory_value');
    if (error) throw translateError(error);
    return toInventoryValue((data as InventoryValueRow[])[0]);
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
