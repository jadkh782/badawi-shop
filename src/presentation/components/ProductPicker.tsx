'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Category, Product } from '@/domain';
import { container } from '@/container';
import { Amount } from './Amount';
import { Sheet } from './Sheet';
import { SearchIcon } from './Icons';

/**
 * Browsing by category, for everything that has no barcode to scan.
 *
 * This is why categories exist in the inventory: loose fruit, bread, single cigarettes and
 * anything sold by weight has no code on it, and tapping a shelf then an item is the fastest
 * route to the cart for those.
 */
export function ProductPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (product: Product) => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    void container().categories.list().then(setCategories).catch(() => setCategories([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);

    // A short pause before querying, so typing a name does not fire a request per keystroke.
    const timer = setTimeout(() => {
      void container()
        .products.list({ search, categoryId, limit: 120 })
        .then((rows) => {
          if (!cancelled) setProducts(rows);
        })
        .catch(() => {
          if (!cancelled) setProducts([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, search, categoryId]);

  const heading = useMemo(() => {
    if (search.trim()) return `Matching "${search.trim()}"`;
    const category = categories.find((c) => c.id === categoryId);
    return category ? category.name : 'All items';
  }, [search, categoryId, categories]);

  return (
    <Sheet open={open} onClose={onClose} title="Add without scanning">
      <div className="relative mb-3">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--color-faint)]" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name"
          aria-label="Search products"
          className="field pl-12"
        />
      </div>

      <div className="strip -mx-4 mb-4 px-4 pb-1">
        <button
          type="button"
          className="chip"
          data-active={categoryId === null}
          onClick={() => setCategoryId(null)}
        >
          All
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className="chip"
            data-active={categoryId === category.id}
            onClick={() => setCategoryId(category.id)}
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

      <p className="eyebrow mb-2">{heading}</p>

      {loading ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted)]">Loading...</p>
      ) : products.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted)]">
          Nothing here yet. Add articles in Inventory first.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 pb-4 sm:grid-cols-3">
          {products.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => onPick(product)}
              disabled={product.isOutOfStock}
              className="card flex flex-col justify-between gap-3 p-3 text-left active:scale-[0.97] disabled:opacity-40"
              style={{ transition: 'transform 120ms ease', minHeight: 108 }}
            >
              <span className="line-clamp-2 text-sm font-semibold leading-snug">{product.name}</span>
              <span className="flex items-end justify-between gap-2">
                <Amount value={product.salePrice} size="sm" />
                <span
                  className={`tnum shrink-0 text-[10px] font-semibold ${
                    product.isOutOfStock
                      ? 'text-[var(--color-danger)]'
                      : product.isLowStock
                        ? 'text-[var(--color-sell)]'
                        : 'text-[var(--color-faint)]'
                  }`}
                >
                  {product.isOutOfStock ? 'none left' : `${product.stock.format()} left`}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
