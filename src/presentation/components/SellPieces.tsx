'use client';

import type { Product } from '@/domain';
import { Amount } from './Amount';
import { ScanIcon, SearchIcon } from './Icons';

/**
 * The strip along the bottom of the camera.
 *
 * An unrecognised barcode is not a failure, it is the most common way a new article gets
 * added: the shop scans a delivery, hits something the till has never seen, and adds it on
 * the spot. So the prompt offers that directly rather than only reporting the problem.
 */
export function ScanHint({
  lastAdded,
  unknownCode,
  onAddUnknown,
  onDismissUnknown,
}: {
  lastAdded: Product | null;
  unknownCode: string | null;
  onAddUnknown: (code: string) => void;
  onDismissUnknown: () => void;
}) {
  if (unknownCode) {
    return (
      <div
        className="mb-3 rounded-2xl border border-[var(--color-sell)] bg-black/85 p-4"
        style={{ animation: 'rise 200ms ease-out' }}
      >
        <p className="eyebrow">Not in inventory</p>
        <p className="tnum mt-1 text-lg font-bold text-white">{unknownCode}</p>
        <div className="mt-3 flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onDismissUnknown}>
            Skip
          </button>
          <button
            type="button"
            className="btn btn-sell flex-1"
            onClick={() => onAddUnknown(unknownCode)}
          >
            Add it now
          </button>
        </div>
      </div>
    );
  }

  if (lastAdded) {
    return (
      <div
        key={lastAdded.id}
        className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-black/70 px-4 py-3"
        style={{ animation: 'rise 200ms ease-out' }}
      >
        <div className="min-w-0">
          <p className="eyebrow">Added</p>
          <p className="mt-0.5 truncate font-semibold text-white">{lastAdded.name}</p>
        </div>
        <Amount value={lastAdded.salePrice} size="sm" className="items-end shrink-0" />
      </div>
    );
  }

  return null;
}

/** An empty till is an invitation, so it says what to do rather than that nothing is here. */
export function EmptyCart({ onScan, onBrowse }: { onScan: () => void; onBrowse: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 px-6 py-16 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-[var(--color-line)] bg-[var(--color-ink-raised)] text-[var(--color-faint)]">
        <ScanIcon className="h-9 w-9" />
      </div>
      <div>
        <p className="font-[family-name:var(--font-display)] text-xl font-bold">Ring up a sale</p>
        <p className="mx-auto mt-2 max-w-[240px] text-sm text-[var(--color-muted)]">
          Scan a barcode to add it to the cart. Items without a barcode are under the search
          button.
        </p>
      </div>
      <div className="flex w-full max-w-xs gap-2">
        <button type="button" className="btn btn-ghost flex-1" onClick={onBrowse}>
          <SearchIcon className="h-5 w-5" />
          Browse
        </button>
        <button type="button" className="btn btn-sell flex-1" onClick={onScan}>
          <ScanIcon className="h-5 w-5" />
          Scan
        </button>
      </div>
    </div>
  );
}
