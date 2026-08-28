'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BudgetView } from '@/application/use-cases';
import { container } from '@/container';
import { messageFor } from '@/infrastructure/supabase/errors';
import { AppShell } from '@/presentation/components/AppShell';
import { useSettings } from '@/presentation/providers/SettingsProvider';

/**
 * The cash box.
 *
 * One number matters here: what there is to spend on the next delivery. Everything else on
 * the screen exists to explain how it got to be that number, because a balance nobody can
 * account for is a balance nobody trusts.
 */
export default function BudgetPage() {
  const { rate } = useSettings();
  const [view, setView] = useState<BudgetView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setView(await container().getBudget.execute(100));
    } catch (e) {
      setError(messageFor(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = view?.summary;

  return (
    <AppShell title="Budget" back="/" wide>
      <div className="flex flex-col gap-4 px-4 pb-10 pt-4">
        {error && (
          <p className="card p-4 text-sm font-medium text-[var(--color-danger)]" role="alert">
            {error}
          </p>
        )}

        <section className="card p-4">
          <p className="eyebrow">Available to spend</p>
          {summary ? (
            <>
              <p
                className="tnum mt-1 text-4xl font-bold leading-none"
                style={{ color: summary.isOverdrawn ? 'var(--color-danger)' : 'var(--color-paper)' }}
              >
                {summary.balance.format()}
              </p>
              <p className="tnum mt-1.5 text-sm text-[var(--color-muted)]">
                {rate.formatLbp(summary.balance)}
              </p>

              {summary.isOverdrawn && (
                <p className="mt-3 rounded-xl bg-[var(--color-danger-dim)] px-3 py-2 text-xs font-medium leading-relaxed text-[var(--color-danger)]">
                  More has gone out than has come in. The next delivery needs paying for from
                  outside, or the shop needs to sell what it already has.
                </p>
              )}
            </>
          ) : (
            <div className="mt-2 h-10 w-40 animate-pulse rounded-lg bg-[var(--color-line)]" />
          )}
        </section>

        <section className="card p-4">
          <p className="eyebrow">Where it came from</p>
          <div className="mt-3 flex flex-col gap-3">
            <Figure
              label="Taken from sales"
              value={summary?.fromSales.format()}
              tone="var(--color-sell)"
            />
            <Figure
              label="Spent on deliveries"
              value={summary ? `-${summary.spentOnRestock.format()}` : undefined}
              tone="var(--color-stock)"
            />
            <Figure
              label="Put in from outside"
              value={summary?.investedFromOutside.format()}
              tone="var(--color-muted)"
            />
            <div className="border-t border-[var(--color-line)] pt-3">
              <Figure
                label="Earned by the shop itself"
                value={summary?.earned.format()}
                hint="The balance, setting aside anything paid in from your own pocket"
              />
            </div>
          </div>
        </section>

        <section className="card p-4">
          <p className="eyebrow">Every entry</p>
          {view && view.movements.length === 0 && (
            <p className="mt-3 text-sm text-[var(--color-faint)]">
              Nothing yet. Sales add to the budget and deliveries take from it.
            </p>
          )}
          <ul className="mt-1">
            {view?.movements.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] py-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{m.describe()}</p>
                  <p className="tnum mt-0.5 text-xs text-[var(--color-faint)]">
                    {m.at.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    {m.note ? ` · ${m.note}` : ''}
                  </p>
                </div>
                <span
                  className="tnum shrink-0 text-sm font-bold"
                  style={{
                    color: m.isMoneyIn ? 'var(--color-sell)' : 'var(--color-muted)',
                  }}
                >
                  {m.isMoneyIn ? '+' : ''}
                  {m.amount.format()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}

function Figure({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value?: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <span className="text-sm text-[var(--color-muted)]">{label}</span>
        {hint && <p className="mt-0.5 text-xs text-[var(--color-faint)]">{hint}</p>}
      </div>
      {value ? (
        <span className="tnum shrink-0 font-bold" style={{ color: tone }}>
          {value}
        </span>
      ) : (
        <span className="h-4 w-16 animate-pulse rounded bg-[var(--color-line)]" />
      )}
    </div>
  );
}
