'use client';

import { useEffect, useState } from 'react';
import { Money, type BudgetSummary } from '@/domain';
import type { PayOutKind } from '@/application/ports';
import { container } from '@/container';
import { messageFor } from '@/infrastructure/supabase/errors';
import { useToast } from '@/presentation/providers/ToastProvider';
import { Sheet } from './Sheet';

/** The bills a shop pays whatever kind of week it has had. */
const EXPENSE_LABELS = ['Rent', 'Electricity', 'Water', 'Internet', 'Wages', 'Repairs'];

/**
 * Money leaving the drawer for something that is not stock.
 *
 * Two kinds, kept apart because they answer different questions. An expense is the cost of
 * keeping the doors open and makes the shop look less profitable, correctly. A drawing is
 * the owner being paid, which is not a cost of running the shop but the reason for running
 * it; counting it as one would make a healthy shop look like it was losing money.
 *
 * The shop is allowed to go overdrawn. Rent falls due whether or not the week was good, and
 * refusing to record it does not stop the money leaving — it only stops the books knowing.
 * So the screen warns and the button still works.
 */
export function PayOutSheet({
  open,
  kind,
  summary,
  onClose,
  onDone,
}: {
  open: boolean;
  kind: PayOutKind;
  summary: BudgetSummary | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { notify } = useToast();
  const [raw, setRaw] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRaw('');
    setNote('');
  }, [open, kind]);

  const paying = kind === 'expense';
  let amount = Money.zero();
  try {
    amount = Money.fromInput(raw || '0');
  } catch {
    amount = Money.zero();
  }

  const valid = amount.cents > 0;
  const balance = summary?.balance ?? Money.zero();
  const after = balance.subtract(amount);
  const overdraws = valid && after.isNegative();

  async function submit() {
    setBusy(true);
    try {
      const result = await container().budget.payOut(kind, amount.cents, note.trim() || null);
      notify(
        paying
          ? `${amount.format()} paid out${note.trim() ? ` for ${note.trim()}` : ''}`
          : `${amount.format()} paid to you`,
        'success',
      );
      // The balance comes back from the same call that moved it, so what the screen says next
      // is what the database actually holds rather than what this device believed.
      if (Money.fromCents(result.balanceCents).isNegative()) {
        notify('The budget is now overdrawn', 'error');
      }
      onDone();
    } catch (error) {
      notify(messageFor(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={paying ? 'Pay a running cost' : 'Pay yourself'}
    >
      <p className="rounded-xl bg-[var(--color-ink)] px-3 py-3 text-xs leading-relaxed text-[var(--color-muted)]">
        {paying
          ? 'Rent, electricity, anything the shop pays to keep its doors open. It comes out of the budget and counts against what the shop has earned.'
          : 'Money you take out for yourself. It comes out of the budget, but it is not a running cost: the shop earned it, and this is you being paid.'}
      </p>

      <label className="eyebrow mt-4 block" htmlFor="payout-amount">
        How much
      </label>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-2xl font-semibold text-[var(--color-faint)]">$</span>
        <input
          id="payout-amount"
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          inputMode="decimal"
          autoFocus
          placeholder="0.00"
          className="field tnum flex-1 text-2xl font-bold"
        />
      </div>

      {paying && (
        <>
          <p className="eyebrow mt-4">What for</p>
          <div className="strip -mx-4 mt-2 px-4 pb-1">
            {EXPENSE_LABELS.map((label) => (
              <button
                key={label}
                type="button"
                className="chip"
                data-active={note.trim().toLowerCase() === label.toLowerCase()}
                onClick={() => setNote(note.trim().toLowerCase() === label.toLowerCase() ? '' : label)}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={paying ? 'Or type what it was for' : 'Note (optional)'}
        aria-label="Note"
        className="field mt-3"
      />

      <div className="card mt-4 flex items-center justify-between p-4">
        <span className="text-sm text-[var(--color-muted)]">Budget afterwards</span>
        <span
          className="tnum text-xl font-bold"
          style={{ color: overdraws ? 'var(--color-danger)' : undefined }}
        >
          {valid ? after.format() : balance.format()}
        </span>
      </div>

      {overdraws && (
        <p
          className="mt-2 rounded-xl bg-[var(--color-danger-dim)] px-3 py-2 text-xs font-medium leading-relaxed text-[var(--color-danger)]"
          role="alert"
        >
          This is more than the shop has. It will still be recorded, because the money leaving
          is a fact either way, but the budget will show as overdrawn until it is covered.
        </p>
      )}

      <button
        type="button"
        className="btn btn-danger mb-2 mt-4 w-full"
        disabled={busy || !valid}
        onClick={() => void submit()}
      >
        {busy
          ? 'Recording...'
          : !valid
            ? 'Enter an amount'
            : paying
              ? `Pay ${amount.format()} out`
              : `Take ${amount.format()}`}
      </button>
    </Sheet>
  );
}
