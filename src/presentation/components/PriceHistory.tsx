'use client';

import { useEffect, useState } from 'react';
import type { PriceChange, Product, StockBatch } from '@/domain';
import { container } from '@/container';
import { useSettings } from '@/presentation/providers/SettingsProvider';

/**
 * What this article has cost over time, and what it is costing right now.
 *
 * The two halves answer different questions. The batches say what is on the shelf at this
 * moment and what each part of it cost, which is what decides today's profit. The history
 * says how it got that way, which is what tells the shop whether a supplier has been
 * creeping their price up a little at a time.
 */
export function PriceHistory({ product, reloadKey }: { product: Product; reloadKey: number }) {
  const { settings } = useSettings();
  const [batches, setBatches] = useState<StockBatch[] | null>(null);
  const [history, setHistory] = useState<PriceChange[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      container().products.batches(product.id),
      container().products.priceHistory(product.id, 25),
    ])
      .then(([openBatches, changes]) => {
        if (cancelled) return;
        setBatches(openBatches);
        setHistory(changes);
      })
      .catch(() => {
        if (cancelled) return;
        setBatches([]);
        setHistory([]);
      });

    return () => {
      cancelled = true;
    };
  }, [product.id, reloadKey]);

  const mixed = (batches?.length ?? 0) > 1;

  return (
    <section className="border-t border-[var(--color-line)] px-4 py-5">
      <p className="eyebrow">What it costs</p>

      <div className="card mt-2 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-[var(--color-muted)]">
            {mixed ? 'Average across the shelf' : 'Cost price'}
          </span>
          <span className="tnum font-bold">{product.costPrice.format()}</span>
        </div>

        {product.lastCostPrice && !product.lastCostPrice.equals(product.costPrice) && (
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className="text-sm text-[var(--color-muted)]">Last price paid</span>
            <span className="tnum font-bold">{product.lastCostPrice.format()}</span>
          </div>
        )}

        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-[var(--color-line)] pt-2">
          <span className="text-sm text-[var(--color-muted)]">Profit per {product.unit}</span>
          <span
            className="tnum font-bold"
            style={{
              color: product.isSoldAtLoss ? 'var(--color-danger)' : 'var(--color-gain)',
            }}
          >
            {product.unitProfit.format()}
            {product.marginPercent === null ? '' : ` · ${product.marginPercent.toFixed(0)}%`}
          </span>
        </div>
      </div>

      {mixed && batches && (
        <>
          <p className="eyebrow mt-4">
            On the shelf at {batches.length} different prices
          </p>
          {settings.tracksPricesSeparately && (
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-faint)]">
              Selling this article asks which of these is going over the counter. It will stop
              asking once the older stock runs out.
            </p>
          )}
          <ul className="mt-2">
            {batches.map((batch) => (
              <li
                key={batch.id}
                className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] py-2.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="tnum text-sm font-semibold">
                    {batch.unitCost.format()} a {product.unit}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-faint)]">
                    {batch.describe()} &middot;{' '}
                    {batch.receivedAt.toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </p>
                </div>
                <span className="tnum shrink-0 text-sm font-bold">
                  {batch.remaining.format()}
                  <span className="ml-1 text-[11px] font-medium text-[var(--color-faint)]">
                    {product.unit}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="eyebrow mt-5">Price history</p>
      {history === null ? (
        <p className="py-4 text-sm text-[var(--color-faint)]">Loading...</p>
      ) : history.length === 0 ? (
        <p className="py-4 text-sm text-[var(--color-faint)]">
          Nothing yet. Every delivery at a new price will be recorded here.
        </p>
      ) : (
        <ul className="mt-2">
          {history.map((change) => (
            <li
              key={change.id}
              className="border-b border-[var(--color-line)] py-2.5 last:border-0"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold">{change.describe()}</span>
                <span className="tnum shrink-0 text-[11px] text-[var(--color-faint)]">
                  {change.at.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                </span>
              </div>

              <p className="tnum mt-0.5 text-[11px] leading-relaxed text-[var(--color-faint)]">
                {change.purchaseCost && (
                  <>
                    paid {change.purchaseCost.format()}
                    {change.quantity ? ` for ${formatUnits(change.quantity)}` : ''}
                    {change.costMoved || change.salePriceMoved ? ' · ' : ''}
                  </>
                )}
                {change.costMoved && (
                  <span style={{ color: change.costWentUp ? 'var(--color-danger)' : undefined }}>
                    cost {change.oldCost.format()} &rarr; {change.newCost.format()}
                  </span>
                )}
                {change.costMoved && change.salePriceMoved ? ' · ' : ''}
                {change.salePriceMoved && (
                  <>
                    sells {change.oldSalePrice.format()} &rarr; {change.newSalePrice.format()}
                  </>
                )}
                {!change.costMoved && !change.salePriceMoved && !change.purchaseCost && (
                  <>no change to either price</>
                )}
              </p>

              {change.note && (
                <p className="mt-0.5 truncate text-[11px] text-[var(--color-faint)]">
                  {change.note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatUnits(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
