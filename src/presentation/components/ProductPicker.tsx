'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Category, Product } from '@/domain';
import { container } from '@/container';
import { Amount } from './Amount';
import { Sheet } from './Sheet';
import { SearchIcon } from './Icons';
import { buildVariantMenu, stockAcross } from './variantMenu';

/**
 * Browsing by category, for everything that has no barcode to scan.
 *
 * This is why categories exist in the inventory: loose fruit, bread, single cigarettes and
 * anything sold by weight has no code on it, and tapping a shelf then an item is the fastest
 * route to the cart for those.
 *
 * A shelf that names its articles from parts is walked rather than listed. Tobacco holds
 * perhaps sixty articles, and sixty tiles is not a menu, it is a search problem. Asked as
 * brand, then taste, then weight it is three taps against a handful of choices each time —
 * and it is the order the customer says it in, which is the order the person at the counter
 * is already holding in their head.
 *
 * Searching skips all of it. Typing is a shortcut past the menu, not a different way through.
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

  // How far into the shelf the cashier has walked. Both null is the brand list.
  const [brand, setBrand] = useState<string | null>(null);
  const [taste, setTaste] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void container().categories.list().then(setCategories).catch(() => setCategories([]));
  }, [open]);

  // Changing shelf, or starting to type, puts you back at the top of the walk.
  useEffect(() => {
    setBrand(null);
    setTaste(null);
  }, [categoryId, search]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);

    // A short pause before querying, so typing a name does not fire a request per keystroke.
    const timer = setTimeout(() => {
      void container()
        // A shelf that is walked needs its whole family in hand to group it, which is more
        // than a single screen of tiles would ever need.
        .products.list({ search, categoryId, limit: categoryId ? 400 : 120 })
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

  const shelf = categories.find((c) => c.id === categoryId) ?? null;
  const searching = search.trim() !== '';
  // Walked only when the shelf says it works that way and nobody is typing.
  const walking = Boolean(shelf?.hasVariants) && !searching;

  const { brands, tastes, weights, loose } = useMemo(
    () =>
      walking
        ? buildVariantMenu(products, brand, taste)
        : { brands: [], tastes: [], weights: [], loose: products },
    [walking, products, brand, taste],
  );

  const heading = useMemo(() => {
    if (searching) return `Matching "${search.trim()}"`;
    if (!shelf) return 'All items';
    return shelf.name;
  }, [searching, search, shelf]);

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

      {/* Where you are in the walk, and the way back out of it. */}
      {walking && (brand || taste !== null) && (
        <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-sm" aria-label="Where you are">
          <Crumb onClick={() => { setBrand(null); setTaste(null); }}>{shelf?.name}</Crumb>
          {brand && (
            <>
              <Chevron />
              {taste === null ? (
                <span className="font-semibold">{brand}</span>
              ) : (
                <Crumb onClick={() => setTaste(null)}>{brand}</Crumb>
              )}
            </>
          )}
          {taste !== null && (
            <>
              <Chevron />
              <span className="font-semibold">{taste || 'No taste'}</span>
            </>
          )}
        </nav>
      )}

      {!walking && <p className="eyebrow mb-2">{heading}</p>}

      {walking && !brand && (
        <p className="eyebrow mb-2">
          {shelf?.baseLabel ?? 'Brand'} &middot; {brands.length}
        </p>
      )}
      {walking && brand && taste === null && (
        <p className="eyebrow mb-2">
          {shelf?.traitLabel ?? 'Variety'} &middot; {tastes.length}
        </p>
      )}
      {walking && taste !== null && <p className="eyebrow mb-2">Weight &middot; {weights.length}</p>}

      {loading ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted)]">Loading...</p>
      ) : walking ? (
        <div className="grid grid-cols-2 gap-2 pb-4 sm:grid-cols-3">
          {/* Brands */}
          {!brand &&
            brands.map((group) => (
              <GroupTile
                key={group.label}
                label={group.label}
                detail={`${group.items.length} ${group.items.length === 1 ? 'article' : 'articles'}`}
                stock={stockAcross(group.items)}
                onClick={() => setBrand(group.label)}
              />
            ))}

          {/* Anything on this shelf without parts, offered alongside the brands. */}
          {!brand &&
            loose.map((product) => (
              <ProductTile key={product.id} product={product} onPick={onPick} />
            ))}

          {/* Tastes for the chosen brand */}
          {brand &&
            taste === null &&
            tastes.map((group) => (
              <GroupTile
                key={group.label || 'none'}
                label={group.label || `No ${(shelf?.traitLabel ?? 'variety').toLowerCase()}`}
                detail={`${group.items.length} ${group.items.length === 1 ? 'size' : 'sizes'}`}
                stock={stockAcross(group.items)}
                onClick={() => setTaste(group.label)}
              />
            ))}

          {/* Weights, which are the articles themselves */}
          {taste !== null &&
            weights.map((product) => (
              <ProductTile
                key={product.id}
                product={product}
                onPick={onPick}
                label={product.variantSize ?? product.name}
              />
            ))}

          {brands.length === 0 && loose.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-[var(--color-muted)]">
              Nothing on this shelf yet. Add articles in Inventory first.
            </p>
          )}
        </div>
      ) : products.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted)]">
          Nothing here yet. Add articles in Inventory first.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 pb-4 sm:grid-cols-3">
          {products.map((product) => (
            <ProductTile key={product.id} product={product} onPick={onPick} />
          ))}
        </div>
      )}
    </Sheet>
  );
}

/** A step on the way to an article: a brand, or a taste. Never something you can sell. */
function GroupTile({
  label,
  detail,
  stock,
  onClick,
}: {
  label: string;
  detail: string;
  stock: number;
  onClick: () => void;
}) {
  const empty = stock <= 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="card flex flex-col justify-between gap-3 p-3 text-left active:scale-[0.97]"
      style={{ transition: 'transform 120ms ease', minHeight: 108 }}
    >
      <span className="line-clamp-2 text-sm font-semibold leading-snug">{label}</span>
      <span className="flex items-end justify-between gap-2">
        <span className="text-[11px] text-[var(--color-faint)]">{detail}</span>
        <span
          className={`tnum shrink-0 text-[10px] font-semibold ${
            empty ? 'text-[var(--color-danger)]' : 'text-[var(--color-faint)]'
          }`}
        >
          {empty ? 'none left' : `${formatUnits(stock)} left`}
        </span>
      </span>
    </button>
  );
}

/** An actual article, which goes in the cart. */
function ProductTile({
  product,
  onPick,
  label,
}: {
  product: Product;
  onPick: (product: Product) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(product)}
      disabled={product.isOutOfStock}
      className="card flex flex-col justify-between gap-3 p-3 text-left active:scale-[0.97] disabled:opacity-40"
      style={{ transition: 'transform 120ms ease', minHeight: 108 }}
    >
      <span className="line-clamp-2 text-sm font-semibold leading-snug">
        {label ?? product.name}
      </span>
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
  );
}

function Crumb({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 rounded-lg px-2 font-semibold text-[var(--color-muted)] underline-offset-4 hover:underline"
    >
      {children}
    </button>
  );
}

function Chevron() {
  return (
    <span className="text-[var(--color-faint)]" aria-hidden>
      ›
    </span>
  );
}

function formatUnits(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
