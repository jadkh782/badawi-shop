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
  onPick: (product: Product, quantity: number) => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // How far into the shelf the cashier has walked. Both null is the brand list.
  const [brand, setBrand] = useState<string | null>(null);
  const [taste, setTaste] = useState<string | null>(null);
  // The article waiting on a count. Chosen here rather than added as one and stepped up in
  // the cart, because "six of those" is one thing the cashier knows and six taps is six
  // chances to lose count while a queue watches.
  const [pending, setPending] = useState<Product | null>(null);

  useEffect(() => {
    if (!open) return;
    void container().categories.list().then(setCategories).catch(() => setCategories([]));
  }, [open]);

  // Changing shelf, or starting to type, puts you back at the top of the walk.
  useEffect(() => {
    setBrand(null);
    setTaste(null);
    setPending(null);
  }, [categoryId, search]);

  useEffect(() => {
    if (!open) setPending(null);
  }, [open]);

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

  if (pending) {
    return (
      <Sheet open={open} onClose={() => setPending(null)} title={pending.name}>
        <HowMany
          product={pending}
          onCancel={() => setPending(null)}
          onConfirm={(quantity) => {
            setPending(null);
            onPick(pending, quantity);
          }}
        />
      </Sheet>
    );
  }

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
              <ProductTile key={product.id} product={product} onPick={setPending} />
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
                onPick={setPending}
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
            <ProductTile key={product.id} product={product} onPick={setPending} />
          ))}
        </div>
      )}
    </Sheet>
  );
}

/**
 * How many of this one.
 *
 * Opens on one, because one is the common answer and the cashier should be able to confirm
 * without thinking. The quick counts are there for the uncommon one: "six of those" is a
 * single fact the cashier already knows, and six taps on a plus button is six chances to
 * lose count while somebody waits.
 *
 * Stock is the ceiling. Nothing here lets the basket ask for more than the shelf holds,
 * because the sale would be refused at checkout and the cashier would find out last.
 */
function HowMany({
  product,
  onConfirm,
  onCancel,
}: {
  product: Product;
  onConfirm: (quantity: number) => void;
  onCancel: () => void;
}) {
  const ceiling = Math.max(1, Math.floor(product.stock.value));
  const [quantity, setQuantity] = useState(1);
  const clamp = (n: number) => Math.max(1, Math.min(ceiling, n));
  const total = product.salePrice.multiply(quantity);

  const quick = [1, 2, 3, 5, 10, 20].filter((n) => n <= ceiling);

  return (
    <>
      <div className="card mb-4 flex items-center justify-between p-4">
        <div className="min-w-0">
          <p className="eyebrow">Each</p>
          <p className="tnum mt-1 text-sm font-semibold">{product.salePrice.format()}</p>
        </div>
        <div className="text-right">
          <p className="eyebrow">On the shelf</p>
          <p className="tnum mt-1 text-sm font-semibold">
            {product.stock.format()}
            <span className="ml-1 text-xs font-medium text-[var(--color-faint)]">
              {product.unit}
            </span>
          </p>
        </div>
      </div>

      <p className="eyebrow">How many</p>
      <div className="mt-2 flex items-center justify-center gap-4">
        <RoundButton label="One fewer" onClick={() => setQuantity(clamp(quantity - 1))} disabled={quantity <= 1}>
          &minus;
        </RoundButton>
        <input
          value={quantity}
          onChange={(event) => {
            const typed = Number(event.target.value.replace(/[^0-9]/g, ''));
            setQuantity(Number.isFinite(typed) && typed > 0 ? clamp(typed) : 1);
          }}
          inputMode="numeric"
          aria-label="How many"
          className="field tnum w-24 text-center text-3xl font-bold"
        />
        <RoundButton
          label="One more"
          onClick={() => setQuantity(clamp(quantity + 1))}
          disabled={quantity >= ceiling}
        >
          +
        </RoundButton>
      </div>

      {quick.length > 1 && (
        <div className="strip -mx-4 mt-4 px-4 pb-1">
          {quick.map((n) => (
            <button
              key={n}
              type="button"
              className="chip"
              data-active={quantity === n}
              onClick={() => setQuantity(n)}
            >
              {n}
            </button>
          ))}
          {ceiling > 1 && (
            <button
              type="button"
              className="chip"
              data-active={quantity === ceiling}
              onClick={() => setQuantity(ceiling)}
            >
              All {ceiling}
            </button>
          )}
        </div>
      )}

      {quantity >= ceiling && product.stock.value >= 1 && (
        <p className="mt-3 text-center text-xs text-[var(--color-faint)]">
          That is everything on the shelf.
        </p>
      )}

      <div className="mt-5 flex gap-2">
        <button type="button" className="btn btn-ghost flex-1" onClick={onCancel}>
          Back
        </button>
        <button
          type="button"
          className="btn btn-sell flex-[2]"
          onClick={() => onConfirm(quantity)}
        >
          Add {quantity} &middot; {total.format()}
        </button>
      </div>
    </>
  );
}

function RoundButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[var(--color-line)] text-2xl font-bold text-[var(--color-muted)] disabled:opacity-30"
    >
      {children}
    </button>
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
