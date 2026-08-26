'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { Category, Product } from '@/domain';
import { container } from '@/container';
import { messageFor } from '@/infrastructure/supabase/errors';
import { beepUnknown, buzzError, primeAudio } from '@/presentation/hooks/feedback';
import { useToast } from '@/presentation/providers/ToastProvider';
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

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [lowOnly, setLowOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

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
  }, [search, categoryId, lowOnly, notify]);

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
