'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DateRange, Money, type SaleRecord } from '@/domain';
import { container } from '@/container';
import { messageFor } from '@/infrastructure/supabase/errors';
import { useToast } from '@/presentation/providers/ToastProvider';
import { AppShell } from '@/presentation/components/AppShell';
import { SaleReverseSheet } from '@/presentation/components/SaleReverseSheet';
import { useSettings } from '@/presentation/providers/SettingsProvider';

type Window = 'today' | 'week' | 'month' | 'all';

const WINDOWS: Array<{ id: Window; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last 7 days' },
  { id: 'month', label: 'Last 30 days' },
  { id: 'all', label: 'Everything' },
];

/**
 * The till roll.
 *
 * A mistake at the counter is noticed minutes later, not months, so this opens on today and
 * puts the most recent sale at the top. Voided sales stay in the list rather than vanishing:
 * "what happened to that sale" has to have an answer, and a gap is not one.
 */
export default function SalesPage() {
  const { notify } = useToast();
  const { rate } = useSettings();

  const [window, setWindow] = useState<Window>('today');
  const [sales, setSales] = useState<SaleRecord[] | null>(null);
  const [chosen, setChosen] = useState<SaleRecord | null>(null);

  const range = useMemo(() => {
    switch (window) {
      case 'today':
        return DateRange.today();
      case 'week':
        return DateRange.lastDays(7);
      case 'month':
        return DateRange.lastDays(30);
      case 'all':
      default:
        return null;
    }
  }, [window]);

  const load = useCallback(async () => {
    try {
      setSales(await container().reverseSale.recent(range, 100));
    } catch (error) {
      notify(messageFor(error), 'error');
      setSales([]);
    }
  }, [range, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const takings = Money.sum((sales ?? []).map((sale) => sale.net));

  return (
    <>
      <AppShell title="Sales" back="/" wide>
        <div className="px-4 pt-4">
          <div className="strip -mx-4 px-4 pb-1 lg:flex-wrap lg:overflow-visible">
            {WINDOWS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="chip"
                data-active={window === option.id}
                onClick={() => setWindow(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {sales && sales.length > 0 && (
          <section className="card mx-4 mt-4 p-4">
            <p className="eyebrow">
              {sales.length} {sales.length === 1 ? 'sale' : 'sales'}, after anything taken back
            </p>
            <p className="tnum mt-1 text-3xl font-bold leading-none">{takings.format()}</p>
            <p className="tnum mt-1.5 text-xs text-[var(--color-faint)]">
              {rate.formatLbp(takings)}
            </p>
          </section>
        )}

        <div className="px-4 pb-10 pt-4">
          {sales === null ? (
            <p className="py-20 text-center text-sm text-[var(--color-muted)]">Loading...</p>
          ) : sales.length === 0 ? (
            <p className="py-20 text-center text-sm text-[var(--color-muted)]">
              No sales in this period.
            </p>
          ) : (
            <ul className="card divide-y divide-[var(--color-line)] px-4">
              {sales.map((sale) => (
                <li key={sale.id}>
                  <button
                    type="button"
                    onClick={() => setChosen(sale)}
                    className="flex w-full items-center gap-3 py-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <span className="tnum">
                          {sale.soldAt.toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span className="text-[var(--color-faint)]">
                          {sale.soldAt.toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </span>
                        {sale.describeState() && (
                          <span
                            className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                            style={{
                              background: sale.isVoided
                                ? 'var(--color-danger-dim)'
                                : 'var(--color-sell-dim)',
                              color: sale.isVoided
                                ? 'var(--color-danger)'
                                : 'var(--color-sell)',
                            }}
                          >
                            {sale.describeState()}
                          </span>
                        )}
                      </p>
                      <p className="tnum mt-0.5 text-[11px] text-[var(--color-faint)]">
                        #{sale.id.slice(0, 8)} &middot; {formatUnits(sale.itemCount)} item
                        {sale.itemCount === 1 ? '' : 's'} &middot; {sale.paymentCurrency}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p
                        className="tnum text-sm font-bold"
                        style={
                          sale.isVoided
                            ? {
                                textDecoration: 'line-through',
                                color: 'var(--color-faint)',
                              }
                            : undefined
                        }
                      >
                        {sale.total.format()}
                      </p>
                      {!sale.isVoided && sale.isRefunded && (
                        <p className="tnum text-[11px] font-semibold text-[var(--color-sell)]">
                          {sale.net.format()} kept
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </AppShell>

      {chosen && (
        <SaleReverseSheet
          open
          sale={chosen}
          onClose={() => setChosen(null)}
          onDone={() => {
            setChosen(null);
            void load();
          }}
        />
      )}
    </>
  );
}

function formatUnits(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
