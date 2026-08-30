'use client';

import { useEffect, useState } from 'react';
import { Money, type SaleRecord, type SoldLine } from '@/domain';
import { container } from '@/container';
import { messageFor } from '@/infrastructure/supabase/errors';
import { useToast } from '@/presentation/providers/ToastProvider';
import { Sheet } from './Sheet';

type Tab = 'void' | 'refund';

/**
 * Taking a sale back.
 *
 * The two ways out are offered side by side because choosing between them is the decision,
 * and hiding one behind a menu would make it the wrong decision by default. A void says the
 * sale never should have happened and erases it. A refund says goods came back today and
 * records that as its own event.
 *
 * Which of the two is even available depends on what has happened to the sale already: a
 * partly returned sale cannot be erased, because erasing it would take the return with it.
 */
export function SaleReverseSheet({
  open,
  sale,
  onClose,
  onDone,
}: {
  open: boolean;
  sale: SaleRecord;
  onClose: () => void;
  onDone: () => void;
}) {
  const { notify } = useToast();
  const [tab, setTab] = useState<Tab>('refund');
  const [lines, setLines] = useState<SoldLine[] | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab(sale.canBeVoided ? 'void' : 'refund');
    setPicked({});
    setReason('');
    setLines(null);
    void container()
      .reverseSale.lines(sale.id)
      .then(setLines)
      .catch((error) => {
        notify(messageFor(error), 'error');
        setLines([]);
      });
  }, [open, sale, notify]);

  const chosen = Object.entries(picked)
    .filter(([, quantity]) => quantity > 0)
    .map(([saleItemId, quantity]) => ({ saleItemId, quantity }));

  // Priced off what the line actually earned rather than off the shelf price, so a sale
  // taken inside a basket discount previews the figure it will really hand back.
  const refundTotal = (lines ?? []).reduce(
    (total, line) => total.add(line.refundValue(picked[line.id] ?? 0)),
    Money.zero(),
  );

  function setQuantity(line: SoldLine, quantity: number) {
    const capped = Math.max(0, Math.min(line.returnable, quantity));
    setPicked((current) => ({ ...current, [line.id]: capped }));
  }

  async function run() {
    setBusy(true);
    try {
      if (tab === 'void') {
        const result = await container().reverseSale.voidSale(sale.id, reason);
        notify(`Sale voided, ${formatUnits(result.units)} back on the shelf`, 'success');
      } else {
        const result = await container().reverseSale.refund(sale.id, chosen, reason);
        notify(
          `${Money.fromCents(result.totalCents).format()} refunded, ${formatUnits(result.units)} back on the shelf`,
          'success',
        );
      }
      onDone();
    } catch (error) {
      notify(messageFor(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={`Sale ${sale.id.slice(0, 8)}`}>
      <div className="card mb-4 flex items-center justify-between p-4">
        <div>
          <p className="eyebrow">Rung up</p>
          <p className="tnum mt-1 text-sm font-semibold">
            {sale.soldAt.toLocaleString('en-GB', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <div className="text-right">
          <p className="tnum text-xl font-bold">{sale.total.format()}</p>
          {sale.isRefunded && (
            <p className="tnum text-[11px] font-semibold text-[var(--color-sell)]">
              {sale.refunded.format()} already returned
            </p>
          )}
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          className="chip flex-1 justify-center"
          data-active={tab === 'void'}
          disabled={!sale.canBeVoided}
          onClick={() => setTab('void')}
        >
          Void it
        </button>
        <button
          type="button"
          className="chip flex-1 justify-center"
          data-active={tab === 'refund'}
          disabled={!sale.canBeReturned}
          onClick={() => setTab('refund')}
        >
          Refund
        </button>
      </div>

      {tab === 'void' ? (
        <p className="rounded-xl bg-[var(--color-ink)] px-3 py-3 text-xs leading-relaxed text-[var(--color-muted)]">
          Every item goes back on the shelf and {sale.total.format()} comes back out of the
          budget. The sale is struck from the figures for the day it was rung up on, as though
          it never happened. Use this for a mis-scan, not for goods a customer brought back.
        </p>
      ) : (
        <>
          <p className="rounded-xl bg-[var(--color-ink)] px-3 py-3 text-xs leading-relaxed text-[var(--color-muted)]">
            Choose what came back. The items return to stock and the money leaves the budget
            today, so today&rsquo;s takings show the refund rather than the original day&rsquo;s.
          </p>

          {lines === null ? (
            <p className="py-8 text-center text-sm text-[var(--color-muted)]">Loading...</p>
          ) : (
            <ul className="mt-3">
              {lines.map((line) => (
                <li
                  key={line.id}
                  className="flex items-center gap-3 border-b border-[var(--color-line)] py-3 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{line.productName}</p>
                    <p className="tnum mt-0.5 text-[11px] text-[var(--color-faint)]">
                      {formatUnits(line.quantity)} {line.unit} at {line.unitPrice.format()}
                      {/* Sold inside a basket discount, so a return is worth less than the
                          shelf price and the row says so rather than surprising anyone. */}
                      {line.wasDiscounted
                        ? ` · ${line.refundValue(1).format()} back each after the discount`
                        : ''}
                      {line.refundedQuantity > 0
                        ? ` · ${formatUnits(line.refundedQuantity)} already back`
                        : ''}
                    </p>
                  </div>

                  {line.isFullyReturned ? (
                    <span className="shrink-0 text-[11px] font-semibold text-[var(--color-faint)]">
                      all returned
                    </span>
                  ) : (
                    <div className="flex shrink-0 items-center gap-1">
                      <StepButton
                        label={`One fewer ${line.productName}`}
                        onClick={() => setQuantity(line, (picked[line.id] ?? 0) - 1)}
                        disabled={(picked[line.id] ?? 0) <= 0}
                      >
                        &minus;
                      </StepButton>
                      <span className="tnum w-8 text-center text-sm font-bold">
                        {formatUnits(picked[line.id] ?? 0)}
                      </span>
                      <StepButton
                        label={`One more ${line.productName}`}
                        onClick={() => setQuantity(line, (picked[line.id] ?? 0) + 1)}
                        disabled={(picked[line.id] ?? 0) >= line.returnable}
                      >
                        +
                      </StepButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {chosen.length > 0 && (
            <div className="card mt-3 flex items-center justify-between p-4">
              <span className="text-sm text-[var(--color-muted)]">Coming back</span>
              <span className="tnum text-xl font-bold">{refundTotal.format()}</span>
            </div>
          )}
        </>
      )}

      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder={tab === 'void' ? 'What went wrong (optional)' : 'Why it came back (optional)'}
        aria-label="Reason"
        className="field mt-4"
      />

      <button
        type="button"
        className="btn btn-danger mb-2 mt-4 w-full"
        disabled={busy || (tab === 'refund' && chosen.length === 0)}
        onClick={() => void run()}
      >
        {busy
          ? 'Working...'
          : tab === 'void'
            ? `Void this sale, ${sale.total.format()} back out`
            : chosen.length === 0
              ? 'Choose what came back'
              : `Refund ${refundTotal.format()}`}
      </button>
    </Sheet>
  );
}

function StepButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-line)] text-lg font-bold text-[var(--color-muted)] disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function formatUnits(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
