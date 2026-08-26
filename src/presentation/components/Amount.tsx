'use client';

import type { Money } from '@/domain';
import { useSettings } from '@/presentation/providers/SettingsProvider';

type Size = 'hero' | 'lg' | 'md' | 'sm';

const SIZES: Record<Size, { usd: string; lbp: string; gap: string }> = {
  hero: { usd: 'text-[44px] leading-[1.05]', lbp: 'text-sm', gap: 'gap-1.5' },
  lg: { usd: 'text-2xl leading-tight', lbp: 'text-[11px]', gap: 'gap-1' },
  md: { usd: 'text-lg leading-tight', lbp: 'text-[10px]', gap: 'gap-0.5' },
  sm: { usd: 'text-sm leading-tight', lbp: 'text-[10px]', gap: 'gap-0' },
};

/**
 * The price tag.
 *
 * Every figure in this shop exists twice, so it is shown twice: dollars on top, a hairline,
 * pounds beneath. Using one component everywhere means a rate change moves every number on
 * every screen at once, and no total can drift out of step with another.
 */
export function Amount({
  value,
  size = 'md',
  tone = 'default',
  showLbp = true,
  className = '',
}: {
  value: Money;
  size?: Size;
  tone?: 'default' | 'sell' | 'gain' | 'muted';
  showLbp?: boolean;
  className?: string;
}) {
  const { rate } = useSettings();
  const s = SIZES[size];

  const toneClass =
    tone === 'sell'
      ? 'text-[var(--color-sell)]'
      : tone === 'gain'
        ? 'text-[var(--color-gain)]'
        : tone === 'muted'
          ? 'text-[var(--color-muted)]'
          : 'text-[var(--color-paper)]';

  return (
    <span className={`inline-flex flex-col items-start ${s.gap} ${className}`}>
      <span className={`tnum font-bold ${s.usd} ${toneClass}`}>{value.format()}</span>
      {showLbp && (
        <span
          className={`tnum ${s.lbp} font-medium text-[var(--color-faint)]`}
          style={{ letterSpacing: '0.06em' }}
        >
          {rate.formatLbp(value)}
        </span>
      )}
    </span>
  );
}
