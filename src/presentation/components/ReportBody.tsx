'use client';

import { useState } from 'react';
import type { ReportData } from '@/application/use-cases';
import { useSettings } from '@/presentation/providers/SettingsProvider';
import { Amount } from './Amount';

/** The figures under the chart: headline numbers, best sellers, shelves, restocking. */
export function ReportBody({ data }: { data: ReportData }) {
  const { rate } = useSettings();
  const [rankBy, setRankBy] = useState<'quantity' | 'profit'>('quantity');
  const { summary } = data;

  const ranked = [...data.topProducts].sort((a, b) =>
    rankBy === 'quantity' ? b.quantitySold - a.quantitySold : b.profit.cents - a.profit.cents,
  );

  return (
    <>
      <section className="card p-4 lg:col-span-2">
        <p className="eyebrow">Total sales</p>
        <div className="mt-2">
          <Amount value={summary.totalSales} size="hero" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-[var(--color-line)] pt-4 lg:grid-cols-3">
          <Figure label="Profit" value={summary.totalProfit.format()} tone="var(--color-gain)" />
          <Figure
            label="Margin"
            value={
              summary.profitMarginPercent === null
                ? '--'
                : `${summary.profitMarginPercent.toFixed(0)}%`
            }
          />
          <Figure label="Transactions" value={String(summary.transactionCount)} />
          <Figure label="Items sold" value={formatUnits(summary.itemsSold)} />
          <Figure label="Average basket" value={summary.averageBasket.format()} />
          <Figure
            label="Discounts given"
            value={summary.totalDiscount.format()}
            tone={summary.totalDiscount.isZero() ? undefined : 'var(--color-sell)'}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--color-line)] pt-4">
          <div className="rounded-xl bg-[var(--color-ink)] p-3">
            <p className="eyebrow">Taken in USD</p>
            <p className="tnum mt-1 font-bold">{summary.salesPaidInUsd.format()}</p>
          </div>
          <div className="rounded-xl bg-[var(--color-ink)] p-3">
            <p className="eyebrow">Taken in LBP</p>
            <p className="tnum mt-1 font-bold">{rate.formatLbp(summary.salesPaidInLbp)}</p>
          </div>
        </div>
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="eyebrow">Best sellers</p>
          <div className="flex gap-1">
            <RankToggle active={rankBy === 'quantity'} onClick={() => setRankBy('quantity')}>
              by quantity
            </RankToggle>
            <RankToggle active={rankBy === 'profit'} onClick={() => setRankBy('profit')}>
              by profit
            </RankToggle>
          </div>
        </div>

        {ranked.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--color-muted)]">
            Nothing was sold in this period.
          </p>
        ) : (
          <ol className="divide-y divide-[var(--color-line)]">
            {ranked.slice(0, 12).map((item, index) => (
              <li key={`${item.productName}-${index}`} className="flex items-center gap-3 py-2.5">
                <span className="tnum w-5 shrink-0 text-sm font-bold text-[var(--color-faint)]">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.productName}</p>
                  <p className="tnum mt-0.5 text-[11px] text-[var(--color-faint)]">
                    {formatUnits(item.quantitySold)} sold
                    {item.categoryName ? ` \u00b7 ${item.categoryName}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tnum text-sm font-bold">{item.revenue.format()}</p>
                  <p className="tnum text-[11px] font-semibold text-[var(--color-gain)]">
                    +{item.profit.format()}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {data.byCategory.length > 0 && (
        <section className="card p-4">
          <p className="eyebrow mb-3">By category</p>
          <ul className="flex flex-col gap-3">
            {data.byCategory.map((item) => {
              const top = data.byCategory[0]?.revenue.cents || 1;
              return (
                <li key={item.categoryName}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-semibold">{item.categoryName}</span>
                    <span className="tnum shrink-0 text-sm font-bold">{item.revenue.format()}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--color-ink)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-stock)]"
                      style={{ width: `${Math.max(2, (item.revenue.cents / top) * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card p-4">
        <p className="eyebrow mb-3">Needs restocking</p>
        {data.lowStock.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--color-muted)]">
            Every shelf is above its alert level.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {data.lowStock.map((item) => (
              <li key={item.productId} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.productName}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-faint)]">{item.categoryName}</p>
                </div>
                <span
                  className="tnum shrink-0 rounded-lg px-2 py-1 text-xs font-bold"
                  style={{
                    background:
                      item.stock <= 0 ? 'var(--color-danger-dim)' : 'var(--color-sell-dim)',
                    color: item.stock <= 0 ? 'var(--color-danger)' : 'var(--color-sell)',
                  }}
                >
                  {item.stock <= 0 ? 'empty' : `${formatUnits(item.stock)} ${item.unit}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="tnum mt-1 text-lg font-bold" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
    </div>
  );
}

function RankToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="min-h-11 rounded-lg px-2.5 text-[10px] font-semibold"
      style={{
        background: active ? 'var(--color-paper)' : 'var(--color-ink)',
        color: active ? 'var(--color-ink)' : 'var(--color-faint)',
      }}
    >
      {children}
    </button>
  );
}

function formatUnits(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
