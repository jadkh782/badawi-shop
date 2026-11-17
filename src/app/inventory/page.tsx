'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { Category, Product } from '@/domain';
import { container } from '@/container';
import { messageFor } from '@/infrastructure/supabase/errors';
import { beepUnknown, buzzError, primeAudio } from '@/presentation/hooks/feedback';
import { useToast } from '@/presentation/providers/ToastProvider';
import { useSettings } from '@/presentation/providers/SettingsProvider';
import { AppShell } from '@/presentation/components/AppShell';
import { Amount } from '@/presentation/components/Amount';
import { ScannerSheet } from '@/presentation/components/ScannerSheet';
import { PlusIcon, ScanIcon, SearchIcon } from '@/presentation/components/Icons';
import { StockBadge, EmptyInventory } from '@/presentation/components/InventoryPieces';

/**
 * Inventory mode.
 *
 * Scanning here jumps straight to the article rather than adding it to anything, which is
 * the difference between the two modes: in Sell a scan means the customer is buying this,
 * in Inventory it means show me this.
 */
export default function InventoryPage() {
  const router = useRouter();
  const { notify } = useToast();
  const { settings } = useSettings();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [lowOnly, setLowOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [coding, setCoding] = useState(false);
  const [confirmCodes, setConfirmCodes] = useState(false);
  // Bumped to pull the list again after something changes it server-side. The codes are
  // generated in the database, so the only way to learn them is to ask for the rows back.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    void container().categories.list().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(() => {
      void container()
        .products.list({ search, categoryId, lowStockOnly: lowOnly, limit: 200 })
        .then((rows) => {
          if (!cancelled) setProducts(rows);
        })
        .catch((error) => {
          if (!cancelled) notify(messageFor(error), 'error');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, categoryId, lowOnly, notify, reloadKey]);

  const onScan = useCallback(
    async (code: string) => {
      try {
        const product = await container().findProductByBarcode.execute(code);
        setScanning(false);
        if (product) {
          router.push(`/inventory/item?id=${product.id}`);
        } else {
          beepUnknown();
          router.push(`/inventory/new?barcode=${encodeURIComponent(code)}`);
        }
      } catch (error) {
        buzzError();
        notify(messageFor(error), 'error');
      }
    },
    [router, notify],
  );

  /*
    Only the codes this shop generated. An article that came with a barcode printed on the
    box already has a label on it, and reprinting those would be a pile of paper nobody
    needs — the point of this is the articles that arrived with nothing to scan.
  */
  const needLabels = products.filter((product) => product.barcode?.isInStore ?? false);

  /*
    Articles on screen with nothing scannable on them. Scoped to the filter rather than the
    whole catalogue on purpose: a shop works a shelf at a time, and committing six hundred
    barcodes on one tap is a decision nobody gets to look at first.
  */
  const needCodes = products.filter((product) => product.barcode === null);

  async function giveBarcodes() {
    setConfirmCodes(false);
    setCoding(true);
    try {
      const made = await container().products.generateBarcodes(needCodes.map((p) => p.id));
      notify(
        made === 0
          ? 'Every article here already had a barcode'
          : `${made} article${made === 1 ? '' : 's'} given a barcode`,
        'success',
      );
      setReloadKey((key) => key + 1);
    } catch (error) {
      notify(messageFor(error), 'error');
    } finally {
      setCoding(false);
    }
  }

  async function printLabels() {
    setPrinting(true);
    try {
      const outcome = await container().receipts.labels(needLabels, settings);
      if (outcome === 'unavailable') notify('No printer could be reached', 'error');
    } catch (error) {
      notify(messageFor(error), 'error');
    } finally {
      setPrinting(false);
    }
  }

  return (
    <>
      <AppShell
        title="Inventory"
        mode="stock"
        back="/"
        wide
        action={
          <Link
            href="/inventory/categories"
            className="-mr-2 flex min-h-11 items-center px-2 text-sm font-semibold text-[var(--color-stock)]"
          >
            Categories
          </Link>
        }
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                primeAudio();
                setScanning(true);
              }}
              className="btn btn-ghost flex-1"
            >
              <ScanIcon className="h-5 w-5" />
              Scan
            </button>
            <Link href="/inventory/new" className="btn btn-stock flex-1">
              <PlusIcon className="h-5 w-5" />
              New article
            </Link>
          </div>
        }
      >
        <div className="px-4 pt-4">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--color-faint)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or barcode"
              aria-label="Search inventory"
              className="field pl-12"
            />
          </div>
        </div>

        {(needCodes.length > 0 || needLabels.length > 0) && (
          <div className="flex flex-col gap-2 px-4 pt-3">
            {/* Two taps, because this writes a code onto every article on screen and the
                first tap is the one that says how many that is. */}
            {needCodes.length > 0 &&
              (confirmCodes ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost flex-1"
                    onClick={() => setConfirmCodes(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-stock flex-1"
                    disabled={coding}
                    onClick={() => void giveBarcodes()}
                  >
                    {coding ? 'Working...' : `Yes, code ${needCodes.length}`}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost w-full"
                  disabled={coding}
                  onClick={() => setConfirmCodes(true)}
                >
                  {`Give ${needCodes.length} article${
                    needCodes.length === 1 ? '' : 's'
                  } a barcode`}
                </button>
              ))}

            {needLabels.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost w-full"
                disabled={printing}
                onClick={() => void printLabels()}
              >
                {printing
                  ? 'Printing...'
                  : `Print ${needLabels.length} label${needLabels.length === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        )}

        <div className="strip mt-3 px-4 pb-1">
          <button
            type="button"
            className="chip"
            data-active={categoryId === null && !lowOnly}
            onClick={() => {
              setCategoryId(null);
              setLowOnly(false);
            }}
          >
            All
          </button>
          <button
            type="button"
            className="chip"
            data-active={lowOnly}
            onClick={() => {
              setLowOnly((value) => !value);
              setCategoryId(null);
            }}
          >
            Running low
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className="chip"
              data-active={categoryId === category.id}
              onClick={() => {
                setCategoryId(category.id);
                setLowOnly(false);
              }}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: category.color }}
                aria-hidden
              />
              {category.name}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="py-16 text-center text-sm text-[var(--color-muted)]">Loading...</p>
        ) : products.length === 0 ? (
          <EmptyInventory filtered={Boolean(search.trim()) || lowOnly || Boolean(categoryId)} />
        ) : (
          <ul className="mt-2 divide-y divide-[var(--color-line)]">
            {products.map((product) => (
              <li key={product.id}>
                <Link
                  href={`/inventory/item?id=${product.id}`}
                  className="flex items-center gap-3 px-4 py-3 active:bg-[var(--color-ink-raised)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{product.name}</p>
                    <p className="mt-0.5 flex items-center gap-2 truncate text-xs text-[var(--color-faint)]">
                      {product.categoryName && <span>{product.categoryName}</span>}
                      {product.barcode && <span className="tnum">{product.barcode.value}</span>}
                    </p>
                  </div>

                  <StockBadge product={product} />
                  <div className="w-[76px]">
                    <Amount value={product.salePrice} size="sm" className="items-end" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AppShell>

      <ScannerSheet
        open={scanning}
        onClose={() => setScanning(false)}
        onDetect={(code) => void onScan(code)}
        title="Scan to find or add"
      />
    </>
  );
}
