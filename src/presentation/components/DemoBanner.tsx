'use client';

import { isDemo } from '@/container';

/**
 * Says out loud that nothing is being saved.
 *
 * Demo mode keeps the whole shop in memory, so closing the app throws away every sale rung
 * up on it. Without this the app looks identical to the real thing, and a till that quietly
 * forgets the day's takings reads as a crash rather than as the demo doing its job.
 */
export function DemoBanner() {
  if (!isDemo) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-[var(--color-sell)]/30 bg-[var(--color-sell-dim)] px-4 py-2 text-[11px] font-semibold leading-snug text-[var(--color-sell)]"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-sell)]" aria-hidden />
      <span>
        Demo data. Nothing is saved &mdash; closing the app clears every sale.
      </span>
    </div>
  );
}
