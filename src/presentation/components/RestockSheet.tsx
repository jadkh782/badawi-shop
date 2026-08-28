'use client';

import { useEffect, useState } from 'react';
import { BudgetSummary, Money, type Product } from '@/domain';
import type { RestockFunding } from '@/application/ports';
import { container } from '@/container';
import { messageFor } from '@/infrastructure/supabase/errors';
import { useToast } from '@/presentation/providers/ToastProvider';
import { Sheet } from './Sheet';

const QUICK = [1, 6, 12, 24];

/**
 * Moving stock.
 *
 * Two reasons, kept apart on purpose: a delivery adds to what is there, a correction sets it
 * to what is actually on the shelf. Both write a ledger entry, so a count that looks wrong
 * next month can be traced to the moment it changed.
 */
export function RestockSheet({
  open,
  product,
  onClose,
  onDone,
}: {
  open: boolean;
  product: Product;
  onClose: () => void;
  onDone: () => void;
}) {
  const { notify } = useToast();
  const [mode, setMode] = useState<'restock' | 'adjustment'>('restock');
  const [raw, setRaw] = useState('');
  const [note, setNote] = useState('');
  const [cost, setCost] = useState('');
  const [funding, setFunding] = useState<RestockFunding>('budget');
  const [budget, setBudget] = useState<BudgetSummary | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode('restock');
    setRaw('');
    setNote('');
    setCost('');
    setFunding('budget');
    // What is in the cash box decides whether this delivery can be paid for out of it, so it
    // belongs on this screen rather than one the shop has to go and look at first.
    void container()
      .getBudget.execute(0)
      .then((view) => setBudget(view.summary))
      .catch(() => setBudget(null));
  }, [open]);

  const entered = Number(raw.replace(',', '.'));
  const valid = Number.isFinite(entered) && raw.trim() !== '';
  const current = product.stock.value;
  const result = mode === 'restock' ? current + entered : entered;
  const delta = mode === 'restock' ? entered : entered - current;
  const isDelivery = mode === 'restock' && entered > 0;

  // Left blank, a delivery is priced at what the article costs. Typing a figure overrides it,
  // because the supplier's price on the day is what actually left the till.
  const typedCost = cost.trim();
  const deliveryCost = !isDelivery
    ? Money.zero()
    : typedCost
      ? Money.fromInput(typedCost)
      : product.costPrice.multiply(entered);

  const paysFromBudget = isDelivery && funding === 'budget';
  const shortfall =
    paysFromBudget && budget ? !budget.canAfford(deliveryCost) : false;

  async function apply() {
    setBusy(true);
    try {
      await container().restockProduct.execute({
        productId: product.id,
        delta,
        reason: mode,
        cost: typedCost || undefined,
        funding,
        note: note.trim() || undefined,
      });
      notify(
        mode === 'restock'
          ? `Added ${entered} ${product.unit} of ${product.name}`
          : `${product.name} set to ${entered} ${product.unit}`,
        'success',
      );
      onDone();
    } catch (error) {
      notify(messageFor(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={product.name}>
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          className="chip flex-1 justify-center"
          data-active={mode === 'restock'}
          onClick={() => setMode('restock')}
        >
          Delivery
        </button>
        <button
          type="button"
          className="chip flex-1 justify-center"
          data-active={mode === 'adjustment'}
          onClick={() => setMode('adjustment')}
        >
          Correction
        </button>
      </div>

      <label className="eyebrow" htmlFor="amount">
        {mode === 'restock' ? 'How many arrived' : 'How many are actually there'}
      </label>
      <input
        id="amount"
        value={raw}
        onChange={(event) => setRaw(event.target.value)}
        inputMode="decimal"
        autoFocus
        placeholder="0"
        className="field tnum mt-2 text-2xl font-bold"
      />

      {mode === 'restock' && (
        <div className="mt-3 flex gap-2">
          {QUICK.map((amount) => (
            <button
              key={amount}
              type="button"
              className="chip flex-1 justify-center"
              onClick={() => setRaw(String((Number(raw) || 0) + amount))}
            >
              +{amount}
            </button>
          ))}
        </div>
      )}

      <div className="card mt-4 flex items-center justify-between p-4">
        <span className="text-sm text-[var(--color-muted)]">New stock level</span>
        <span className="tnum text-xl font-bold">
          {valid ? formatStock(result) : product.stock.format()}
          <span className="ml-1.5 text-xs font-medium text-[var(--color-faint)]">
            {product.unit}
          </span>
        </span>
      </div>

      {valid && result < 0 && (
        <p className="mt-2 text-sm font-medium text-[var(--color-danger)]" role="alert">
          Stock cannot go below zero.
        </p>
      )}

      {isDelivery && (
        <div className="mt-4 border-t border-[var(--color-line)] pt-4">
          <label className="eyebrow" htmlFor="cost">
            What the delivery cost
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-lg font-semibold text-[var(--color-faint)]">$</span>
            <input
              id="cost"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
              inputMode="decimal"
              placeholder={product.costPrice.multiply(entered).format().replace('$', '')}
              className="field flex-1"
            />
          </div>
          <p className="mt-1.5 text-xs text-[var(--color-faint)]">
            {typedCost
              ? `Paying ${deliveryCost.format()} for ${entered} ${product.unit}`
              : `Left blank this is ${deliveryCost.format()}, at the cost price on the article`}
          </p>

          <p className="eyebrow mt-4">Paid for with</p>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <FundingChoice
              label="Shop money"
              detail={budget ? `${budget.balance.format()} available` : 'Loading...'}
              selected={funding === 'budget'}
              onSelect={() => setFunding('budget')}
            />
            <FundingChoice
              label="My own money"
              detail="Recorded as put in"
              selected={funding === 'outside'}
              onSelect={() => setFunding('outside')}
            />
          </div>

          {shortfall && budget && (
            <p className="mt-2 rounded-xl bg-[var(--color-danger-dim)] px-3 py-2 text-xs font-medium leading-relaxed text-[var(--color-danger)]">
              The shop only has {budget.balance.format()}. This will take the budget to{' '}
              {budget.balance.subtract(deliveryCost).format()}. Choose <b>My own money</b> if you
              are paying for it yourself.
            </p>
          )}

          {funding === 'outside' && (
            <p className="mt-2 text-xs leading-relaxed text-[var(--color-faint)]">
              The budget stays where it is, and {deliveryCost.format()} is recorded as money you
              put in from outside.
            </p>
          )}
        </div>
      )}

      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={mode === 'restock' ? 'Supplier or invoice (optional)' : 'Why (optional)'}
        aria-label="Note"
        className="field mt-4"
      />

      <button
        type="button"
        className="btn btn-stock mb-2 mt-4 w-full"
        disabled={busy || !valid || result < 0 || delta === 0}
        onClick={() => void apply()}
      >
        {busy ? 'Saving...' : mode === 'restock' ? 'Add to stock' : 'Correct the count'}
      </button>
    </Sheet>
  );
}

function formatStock(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '');
}

function FundingChoice({
  label,
  detail,
  selected,
  onSelect,
}: {
  label: string;
  detail: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="min-h-16 rounded-2xl border px-3 py-2 text-left"
      style={{
        borderColor: selected ? 'var(--color-stock)' : 'var(--color-line)',
        background: selected ? 'var(--color-stock-dim)' : 'transparent',
      }}
    >
      <span className="block text-sm font-semibold">{label}</span>
      <span className="tnum mt-0.5 block text-xs text-[var(--color-faint)]">{detail}</span>
    </button>
  );
}
