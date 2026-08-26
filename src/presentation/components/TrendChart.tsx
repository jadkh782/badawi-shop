'use client';

import { useMemo, useState } from 'react';
import type { TimeSeriesPoint } from '@/domain';
import { Money } from '@/domain';

/**
 * Takings per period, split into what the goods cost and what the shop kept.
 *
 * Profit sits on the baseline rather than on top, because only the bottom segment of a
 * stacked bar can be compared accurately from one bar to the next, and profit is the figure
 * worth comparing. Total bar height is still the day takings.
 *
 * The two fills were checked against the dark background for colour-blind separation
 * (worst-case deutan/protan dE 9.5) rather than picked by eye, and neither carries meaning
 * alone: both are named in the legend and in the readout above the bars.
 *
 * Built from elements rather than SVG so the labels stay crisp at any width and each bar is
 * a real tap target, which is the mobile equivalent of a hover tooltip.
 */
const PROFIT = '#26a06d';
const COST = '#bd7a0c';

export function TrendChart({ points }: { points: readonly TimeSeriesPoint[] }) {
  const [selected, setSelected] = useState<number | null>(null);

  const max = useMemo(
    () => Math.max(1, ...points.map((point) => point.sales.cents)),
    [points],
  );

  // One period is not a trend. A single full-width block says nothing the headline figures
  // above it do not already say, so there is nothing to draw.
  if (points.length < 2) {
    return null;
  }

  const busiest = points.reduce(
    (best, point, index) => (point.sales.cents > (points[best]?.sales.cents ?? 0) ? index : best),
    0,
  );
  const active = selected ?? busiest;
  const shown = points[active];
  const everythingZero = points.every((point) => point.sales.isZero());

  return (
    <figure className="card p-4">
      <figcaption className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{shown ? shown.label : 'No sales'}</p>
          <p className="tnum mt-1 text-xl font-bold">
            {(shown?.sales ?? Money.zero()).format()}
          </p>
        </div>
        <div className="text-right">
          <p className="eyebrow">of which profit</p>
          <p className="tnum mt-1 text-xl font-bold" style={{ color: PROFIT }}>
            {(shown?.profit ?? Money.zero()).format()}
          </p>
        </div>
      </figcaption>

      <div className="relative h-[132px]">
        {[0, 0.25, 0.5, 0.75].map((fraction) => (
          <span
            key={fraction}
            className="absolute inset-x-0 border-t border-[var(--color-line)]"
            style={{ top: `${fraction * 100}%` }}
            aria-hidden
          />
        ))}

        <div className="absolute inset-0 flex items-end gap-[2px]">
          {points.map((point, index) => {
            const total = (point.sales.cents / max) * 100;
            const profit = point.profit.cents > 0 ? (point.profit.cents / max) * 100 : 0;
            const cost = Math.max(0, total - profit);
            const isActive = index === active;

            return (
              <button
                key={point.bucketStart.toISOString()}
                type="button"
                onClick={() => setSelected(index)}
                aria-label={`${point.label}: ${point.sales.format()} sales, ${point.profit.format()} profit`}
                aria-pressed={isActive}
                className="group flex h-full min-w-0 flex-1 flex-col justify-end"
                style={{ opacity: isActive || everythingZero ? 1 : 0.55 }}
              >
                {cost > 0 && (
                  <span
                    className="w-full rounded-t-[4px]"
                    style={{ height: `${cost}%`, background: COST }}
                  />
                )}
                {profit > 0 && (
                  <span
                    className="w-full"
                    style={{
                      height: `${profit}%`,
                      background: PROFIT,
                      // A 2px gap in the surface colour keeps the two segments legible when
                      // one of them is only a few pixels tall.
                      borderTop: cost > 0 ? '2px solid var(--color-ink-raised)' : 'none',
                      borderTopLeftRadius: cost > 0 ? 0 : 4,
                      borderTopRightRadius: cost > 0 ? 0 : 4,
                    }}
                  />
                )}
                {total === 0 && (
                  <span className="h-[2px] w-full rounded-full bg-[var(--color-line)]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex justify-between text-[10px] font-medium text-[var(--color-faint)]">
        <span>{points[0]?.label}</span>
        {points.length > 2 && <span>{points[points.length - 1]?.label}</span>}
      </div>

      <div className="mt-3 flex items-center gap-4 border-t border-[var(--color-line)] pt-3">
        <Key color={PROFIT} label="Profit" />
        <Key color={COST} label="Cost of goods" />
        <span className="ml-auto text-[10px] text-[var(--color-faint)]">tap a bar</span>
      </div>

      {/* The same numbers as text, for a screen reader or anyone who cannot read the fills. */}
      <table className="sr-only">
        <caption>Sales and profit per period</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Sales</th>
            <th scope="col">Profit</th>
            <th scope="col">Transactions</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.bucketStart.toISOString()}>
              <th scope="row">{point.label}</th>
              <td>{point.sales.format()}</td>
              <td>{point.profit.format()}</td>
              <td>{point.transactionCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-muted)]">
      <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}
