'use client';

import type { Product, StockBatch } from '@/domain';
import { Sheet } from './Sheet';

/**
 * Which price is going over the counter.
 *
 * Only ever shown when the shop keeps delivery prices apart and this article is holding
 * stock bought at more than one of them. The customer pays the same either way; what changes
 * is what the shop records as having paid for it, which is the difference between a profit
 * figure that is right and one that is roughly right.
 *
 * It stops appearing on its own. Once the older stock sells through there is one batch left
 * and nothing to choose between, so the question simply stops being asked.
 */
export function BatchPicker({
  open,
  product,
  batches,
  onClose,
  onPick,
}: {
  open: boolean;
  product: Product;
  batches: readonly StockBatch[];
  onClose: () => void;
  onPick: (batch: StockBatch) => void;
}) {
  // Batches arrive oldest first, which is also the order stock would go in if nobody chose.
  const oldest = batches[0];

  return (
    <Sheet open={open} onClose={onClose} title={product.name}>
      <p className="text-sm leading-relaxed text-[var(--color-muted)]">
        This is on the shelf at {batches.length} different purchase prices. Which one is the
        customer taking?
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {batches.map((batch) => (
          <li key={batch.id}>
            <button
              type="button"
              onClick={() => onPick(batch)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--color-line)] px-4 py-3 text-left active:scale-[0.99]"
              style={{ transition: 'transform 120ms ease' }}
            >
              <div className="min-w-0">
                <p className="tnum text-sm font-bold">
                  Bought at {batch.unitCost.format()}
                  {batch.id === oldest?.id && batches.length > 1 && (
                    <span className="ml-2 rounded-md bg-[var(--color-stock-dim)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-stock)]">
                      oldest
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--color-faint)]">
                  {batch.describe()} &middot;{' '}
                  {batch.receivedAt.toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                  })}{' '}
                  &middot; profit {product.salePrice.subtract(batch.unitCost).format()}
                </p>
              </div>
              <span className="tnum shrink-0 text-sm font-bold">
                {batch.remaining.format()}
                <span className="ml-1 text-[11px] font-medium text-[var(--color-faint)]">
                  left
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="mb-2 mt-4 text-center text-xs text-[var(--color-faint)]">
        Selling at {product.salePrice.format()} either way.
      </p>
    </Sheet>
  );
}
