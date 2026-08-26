'use client';

import { useEffect, useState } from 'react';
import type { Sale } from '@/domain';
import { container } from '@/container';
import { useSettings } from '@/presentation/providers/SettingsProvider';
import { Amount } from './Amount';

/**
 * The moment after the money.
 *
 * It reads back what was actually recorded rather than what the screen believed a second
 * ago, so the confirmation is proof the sale is in the books. Change due is worked out in
 * whichever currency the customer paid in, since that is the arithmetic the cashier would
 * otherwise be doing in their head with a queue waiting.
 */
export function SaleComplete({
  saleId,
  onNewSale,
  onDone,
}: {
  saleId: string;
  onNewSale: () => void;
  onDone: () => void;
}) {
  const { rate } = useSettings();
  const [sale, setSale] = useState<Sale | null>(null);
  const [tendered, setTendered] = useState('');

  useEffect(() => {
    void container().sales.findById(saleId).then(setSale).catch(() => setSale(null));
  }, [saleId]);

  const paidInUsd = sale?.paymentCurrency === 'USD';
  const dueValue = sale ? (paidInUsd ? sale.total.dollars : sale.totalLbp) : 0;
  const given = Number(tendered.replace(/[,\s]/g, '')) || 0;
  const change = given > 0 ? given - dueValue : 0;

  return (
    <main className="safe-top flex min-h-dvh flex-col px-4 pb-6 pt-6">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-sell)]"
          style={{ animation: 'rise 260ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}
          aria-hidden
        >
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="#1a1206" strokeWidth={3}>
            <path d="m5 12.5 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <div>
          <p className="eyebrow">Sale recorded</p>
          <div className="mt-3 flex justify-center">
            {sale ? (
              <Amount value={sale.total} size="hero" />
            ) : (
              <span className="tnum text-[44px] font-bold text-[var(--color-faint)]">...</span>
            )}
          </div>
          {sale && (
            <p className="tnum mt-3 text-xs text-[var(--color-faint)]">
              #{sale.id.slice(0, 8)} &middot; paid in {sale.paymentCurrency} &middot;{' '}
              {formatCount(sale.itemCount)} item{sale.itemCount === 1 ? '' : 's'}
            </p>
          )}
        </div>

        {sale && (
          <div className="card w-full max-w-xs p-4 text-left">
            <label className="eyebrow" htmlFor="tendered">
              Cash given ({sale.paymentCurrency})
            </label>
            <input
              id="tendered"
              value={tendered}
              onChange={(event) => setTendered(event.target.value)}
              inputMode="decimal"
              placeholder={paidInUsd ? sale.total.format() : rate.formatLbp(sale.total)}
              className="field tnum mt-2 text-xl font-bold"
            />
            {given > 0 && (
              <p
                className={`tnum mt-3 text-center text-lg font-bold ${
                  change < 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-gain)]'
                }`}
              >
                {change < 0 ? 'Still owed ' : 'Change '}
                {formatCurrency(Math.abs(change), paidInUsd)}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="safe-bottom flex gap-2">
        <button type="button" className="btn btn-ghost flex-1" onClick={onDone}>
          Done
        </button>
        <button type="button" className="btn btn-sell flex-1" onClick={onNewSale}>
          Next sale
        </button>
      </div>
    </main>
  );
}

function formatCurrency(value: number, usd: boolean): string {
  if (usd) return `$${value.toFixed(2)}`;
  return `${Math.round(value).toLocaleString('en-US')} L.L.`;
}

function formatCount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
