'use client';

import type { Product } from '@/domain';

/**
 * The stock count, coloured by how urgent it is.
 *
 * Red for an empty shelf, amber for one about to be empty. The number itself is always
 * shown, because "low" without a figure is not enough to decide what to reorder.
 */
export function StockBadge({ product }: { product: Product }) {
  const tone = product.isOutOfStock
    ? { bg: 'var(--color-danger-dim)', fg: 'var(--color-danger)' }
    : product.isLowStock
      ? { bg: 'var(--color-sell-dim)', fg: 'var(--color-sell)' }
      : { bg: 'var(--color-ink-high)', fg: 'var(--color-muted)' };

  return (
    <span
      className="tnum shrink-0 rounded-lg px-2 py-1 text-xs font-bold"
      style={{ background: tone.bg, color: tone.fg }}
      title={`${product.stock.format()} ${product.unit} in stock`}
    >
      {product.stock.format()}
    </span>
  );
}

export function EmptyInventory({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 px-8 py-16 text-center">
      <p className="font-[family-name:var(--font-display)] text-xl font-bold">
        {filtered ? 'Nothing matches' : 'No articles yet'}
      </p>
      <p className="max-w-[260px] text-sm text-[var(--color-muted)]">
        {filtered
          ? 'Try a different name, or clear the filters above.'
          : 'Scan a barcode or tap New article to put the first item on the shelf.'}
      </p>
    </div>
  );
}
