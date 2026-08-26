'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DateRange, Money, SalesSummary } from '@/domain';
import { container } from '@/container';
import { useSettings } from '@/presentation/providers/SettingsProvider';
import { useSession } from '@/presentation/providers/SessionProvider';
import { CartIcon, BoxIcon, ChartIcon, GearIcon } from '@/presentation/components/Icons';
import { DemoBanner } from '@/presentation/components/DemoBanner';

/**
 * Home is two buttons.
 *
 * The shop asked for two modes and easy navigation, so the answer is not a dashboard with
 * the modes tucked into a menu. Selling and stocking fill the screen; everything else is a
 * quiet row underneath.
 */
export default function HomePage() {
  const { settings, rate } = useSettings();
  const { ready, user } = useSession();
  const [today, setToday] = useState<SalesSummary | null>(null);

  useEffect(() => {
    if (!user) return;
    void container()
      .reports.summary(DateRange.today())
      .then(setToday)
      .catch(() => setToday(null));
  }, [user]);

  // Brief, and only when the lock screen is off. A black rectangle with no explanation is
  // what an app looks like when it has crashed, so it says what it is doing instead.
  if (!ready || !user) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6" aria-busy="true">
        <p className="text-sm text-[var(--color-faint)]">Connecting to the shop database...</p>
      </main>
    );
  }

  return (
    <main className="safe-top mx-auto flex min-h-dvh w-full max-w-3xl flex-col pb-6 lg:justify-center">
      <DemoBanner />
      {/* The banner runs edge to edge; everything below it keeps the page gutter. */}
      <div className="flex flex-1 flex-col px-4 pt-5 lg:px-8 lg:pt-10">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold leading-none">
            {settings.shopName}
          </h1>
          {/* The rate is a living number in this shop, so it lives on the home screen. */}
          <p className="tnum mt-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--color-muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-sell)]" aria-hidden />
            $1 = {rate.usdToLbp.toLocaleString('en-US')} L.L.
          </p>
        </div>
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-line)] text-[var(--color-muted)]"
        >
          <GearIcon className="h-5 w-5" />
        </Link>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <ModeButton
          href="/sell"
          label="Sell"
          detail="Scan items and check out"
          accent="var(--color-sell)"
          text="#1a1206"
          icon={<CartIcon className="h-8 w-8" />}
        />
        <ModeButton
          href="/inventory"
          label="Inventory"
          detail="Add articles and restock"
          accent="var(--color-stock)"
          text="#06222b"
          icon={<BoxIcon className="h-8 w-8" />}
        />
      </div>

      <section className="card mb-3 mt-3 p-4 lg:p-5">
        <p className="eyebrow">Today so far</p>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div>
            <p className="tnum text-3xl font-bold leading-none">
              {(today?.totalSales ?? Money.zero()).format()}
            </p>
            <p className="tnum mt-1.5 text-[11px] font-medium tracking-[0.06em] text-[var(--color-faint)]">
              {rate.formatLbp(today?.totalSales ?? Money.zero())}
            </p>
          </div>
          <div className="text-right">
            <p className="tnum text-lg font-semibold text-[var(--color-gain)]">
              {(today?.totalProfit ?? Money.zero()).format()}
            </p>
            <p className="eyebrow mt-1">profit</p>
          </div>
        </div>
        <p className="mt-3 border-t border-[var(--color-line)] pt-3 text-xs text-[var(--color-muted)]">
          {today ? `${today.transactionCount} sales, ${formatUnits(today.itemsSold)} items` : 'Loading...'}
        </p>
      </section>

      <Link href="/reports" className="btn btn-ghost mt-auto w-full lg:mt-0">
        <ChartIcon className="h-5 w-5" />
        Reports and export
      </Link>
      </div>
    </main>
  );
}

function ModeButton({
  href,
  label,
  detail,
  accent,
  text,
  icon,
}: {
  href: string;
  label: string;
  detail: string;
  accent: string;
  text: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col justify-between rounded-[24px] p-5 active:scale-[0.98]"
      style={{ background: accent, color: text, transition: 'transform 120ms ease', minHeight: 132 }}
    >
      <span className="flex items-center justify-between">
        {icon}
        <span className="text-2xl opacity-50" aria-hidden>
          →
        </span>
      </span>
      <span>
        <span className="block font-[family-name:var(--font-display)] text-[30px] font-bold leading-none">
          {label}
        </span>
        <span className="mt-1.5 block text-sm font-medium opacity-70">{detail}</span>
      </span>
    </Link>
  );
}

function formatUnits(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
