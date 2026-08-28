'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSettings } from '@/presentation/providers/SettingsProvider';
import { BackIcon, CartIcon, BoxIcon, ChartIcon, GearIcon, WalletIcon } from './Icons';
import { DemoBanner } from './DemoBanner';

export type Mode = 'sell' | 'stock' | 'neutral';

const ACCENT: Record<Mode, string> = {
  sell: 'var(--color-sell)',
  stock: 'var(--color-stock)',
  neutral: 'var(--color-line)',
};

const NAV = [
  { href: '/sell', label: 'Sell', icon: CartIcon, accent: 'var(--color-sell)' },
  { href: '/inventory', label: 'Inventory', icon: BoxIcon, accent: 'var(--color-stock)' },
  { href: '/budget', label: 'Budget', icon: WalletIcon, accent: 'var(--color-sell)' },
  { href: '/reports', label: 'Reports', icon: ChartIcon, accent: 'var(--color-paper)' },
];

/**
 * The frame every screen sits in, in both shapes it has to take.
 *
 * On a phone the screen is the app: a title bar on top, the actions pinned in thumb reach at
 * the bottom, and a coloured rule saying which mode you are in.
 *
 * On a desktop there is room for the modes to be permanently on show, so they move into a
 * rail down the left and the back button stops being the only way around. Nothing else about
 * a screen changes: it is the same app, given the width it has.
 */
export function AppShell({
  title,
  mode = 'neutral',
  back,
  action,
  children,
  footer,
  wide = false,
}: {
  title: string;
  mode?: Mode;
  back?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** For screens that put content side by side. A form or a page of prose stays narrow,
   *  because a text field stretched across a monitor is harder to use, not easier. */
  wide?: boolean;
}) {
  const router = useRouter();
  const width = wide ? 'max-w-3xl lg:max-w-5xl' : 'max-w-3xl';

  return (
    <div className="min-h-dvh bg-[var(--color-ink)] lg:flex">
      <Sidebar />

      <div className="flex min-h-dvh flex-1 flex-col lg:min-h-0">
        <DemoBanner />
        <header className="safe-top sticky top-0 z-40 bg-[var(--color-ink)]/95 backdrop-blur lg:static lg:bg-transparent">
          <div className={`mx-auto flex w-full ${width} items-center gap-3 px-4 py-3 lg:px-8 lg:pt-8`}>
            {back ? (
              <button
                type="button"
                onClick={() => router.push(back)}
                aria-label="Go back"
                // Returning to the home screen is what the left rail already does, so the
                // arrow only earns its place on a sub-page.
                className={`-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-muted)] ${
                  back === '/' ? 'lg:hidden' : ''
                }`}
              >
                <BackIcon />
              </button>
            ) : (
              <Link
                href="/"
                aria-label="Home"
                className="font-[family-name:var(--font-display)] text-sm font-bold tracking-tight text-[var(--color-muted)] lg:hidden"
              >
                BS
              </Link>
            )}

            <h1 className="flex-1 truncate font-[family-name:var(--font-display)] text-lg font-bold lg:text-3xl">
              {title}
            </h1>

            {action}
          </div>
          <div
            className={`h-[3px] w-full lg:mx-auto lg:mt-4 lg:px-8 ${wide ? 'lg:max-w-5xl' : 'lg:max-w-3xl'}`}
            style={{ background: ACCENT[mode] }}
          />
        </header>

        <main className={`mx-auto w-full ${width} flex-1 lg:px-4 lg:pb-10`}>{children}</main>

        {footer && (
          <div className="safe-bottom sticky bottom-0 z-40 border-t border-[var(--color-line)] bg-[var(--color-ink)]/95 px-4 pt-3 backdrop-blur lg:pb-6">
            <div className={`mx-auto w-full ${width} lg:px-4`}>{footer}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The left rail. Only ever visible where there is width to spare for it. */
function Sidebar() {
  const pathname = usePathname();
  const { settings, rate } = useSettings();

  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-[var(--color-line)] px-4 py-6 lg:flex">
      <Link href="/" className="px-2">
        <span className="block font-[family-name:var(--font-display)] text-xl font-bold leading-tight">
          {settings.shopName}
        </span>
        <span className="tnum mt-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--color-muted)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-sell)]" aria-hidden />
          $1 = {rate.usdToLbp.toLocaleString('en-US')} L.L.
        </span>
      </Link>

      <nav className="mt-8 flex flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className="flex min-h-12 items-center gap-3 rounded-2xl px-3 font-semibold"
              style={{
                background: active ? 'var(--color-ink-raised)' : 'transparent',
                color: active ? item.accent : 'var(--color-muted)',
              }}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Link
        href="/settings"
        aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
        className="mt-auto flex min-h-12 items-center gap-3 rounded-2xl px-3 font-semibold text-[var(--color-muted)]"
        style={{
          background: pathname.startsWith('/settings') ? 'var(--color-ink-raised)' : 'transparent',
        }}
      >
        <GearIcon className="h-5 w-5" />
        Settings
      </Link>
    </aside>
  );
}
