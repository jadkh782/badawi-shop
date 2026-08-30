'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BudgetSummary, Category } from '@/domain';
import { Product } from '@/domain';
import { Money } from '@/domain';
import type { ProductFormInput } from '@/application/use-cases';
import { SaveProduct } from '@/application/use-cases';
import { container } from '@/container';
import { useSettings } from '@/presentation/providers/SettingsProvider';
import { primeAudio } from '@/presentation/hooks/feedback';
import { ScannerSheet } from './ScannerSheet';
import { ScanIcon } from './Icons';

const UNITS = ['piece', 'pack', 'box', 'kg', 'g', 'litre', 'bottle', 'can'];

export function emptyForm(barcode = ''): ProductFormInput {
  return {
    barcode,
    name: '',
    categoryId: null,
    costPrice: '',
    salePrice: '',
    quantity: '',
    lowStockThreshold: '2',
    unit: 'piece',
    notes: '',
    variantSize: '',
    variantTrait: '',
    funding: 'budget',
  };
}

export function formFrom(product: Product): ProductFormInput {
  return {
    barcode: product.barcode?.value ?? '',
    // The brand on its own. The size and taste are edited as themselves below, and the
    // stored name is reassembled from all three on save.
    name: product.brandName,
    categoryId: product.categoryId,
    costPrice: product.costPrice.dollars.toFixed(2),
    salePrice: product.salePrice.dollars.toFixed(2),
    quantity: String(product.stock.value),
    lowStockThreshold: String(product.lowStockThreshold.value),
    unit: product.unit,
    notes: product.notes ?? '',
    variantSize: product.variantSize ?? '',
    variantTrait: product.variantTrait ?? '',
    // Editing an article never spends anything, so this is only ever read on create.
    funding: 'budget',
  };
}

/**
 * The article form, shared by adding and editing.
 *
 * The margin readout under the prices is what makes this more than a list of inputs: it
 * turns two numbers the shop already knows into the one it actually cares about, and it
 * warns before an article is saved at a loss rather than after a month of selling it so.
 */
export function ProductForm({
  value,
  onChange,
  showQuantity,
}: {
  value: ProductFormInput;
  onChange: (next: ProductFormInput) => void;
  showQuantity: boolean;
}) {
  const { rate } = useSettings();
  const [categories, setCategories] = useState<Category[]>([]);
  // What is already on this shelf, so a taste is picked from the list rather than retyped
  // slightly differently. Getting "Double Apple" and "double apple" into the catalogue as
  // two things is the whole problem this shelf is trying to avoid.
  const [siblings, setSiblings] = useState<Product[]>([]);
  const [scanning, setScanning] = useState(false);
  const [budget, setBudget] = useState<BudgetSummary | null>(null);

  useEffect(() => {
    void container().categories.list().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    // Only the create form spends money, so only it needs to know what there is to spend.
    if (!showQuantity) return;
    void container()
      .getBudget.execute(0)
      .then((view) => setBudget(view.summary))
      .catch(() => setBudget(null));
  }, [showQuantity]);

  // Opening stock is a purchase. What it costs decides whether the shop can cover it, and
  // whether the question below is worth asking at all.
  const openingCost = showQuantity ? SaveProduct.openingCost(value) : Money.zero();
  const shortfall =
    value.funding === 'budget' && budget !== null && !openingCost.isZero()
      ? !budget.canAfford(openingCost)
      : false;

  useEffect(() => {
    const shelfId = value.categoryId;
    if (!shelfId) {
      setSiblings([]);
      return;
    }
    let cancelled = false;
    void container()
      .products.list({ categoryId: shelfId, limit: 300 })
      .then((rows) => {
        if (!cancelled) setSiblings(rows);
      })
      .catch(() => {
        if (!cancelled) setSiblings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [value.categoryId]);

  const set = (patch: Partial<ProductFormInput>) => onChange({ ...value, ...patch });

  const shelf = categories.find((category) => category.id === value.categoryId) ?? null;
  // Only shelves that say they come in sizes get the extra fields. Everywhere else the form
  // is exactly what it always was.
  const variantShelf = shelf?.hasVariants ? shelf : null;
  const assembled = Product.assembleName(value.name, value.variantTrait, value.variantSize);

  // Brands already on the shelf, and the tastes already recorded for the brand being typed.
  const knownBrands = Array.from(
    new Set(siblings.map((p) => p.brandName).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  const brandNow = value.name.trim().toLowerCase();
  const knownTastes = Array.from(
    new Set(
      siblings
        .filter((p) => p.brandName.trim().toLowerCase() === brandNow)
        .map((p) => p.variantTrait)
        .filter((t): t is string => Boolean(t)),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const margin = useMemo(() => {
    try {
      const cost = Money.fromInput(value.costPrice);
      const price = Money.fromInput(value.salePrice);
      if (price.isZero()) return null;
      const profit = price.subtract(cost);
      return { profit, percent: (profit.cents / price.cents) * 100, price };
    } catch {
      return null;
    }
  }, [value.costPrice, value.salePrice]);

  return (
    <div className="flex flex-col gap-5 px-4 py-5 lg:gap-6 lg:py-8">
      <div>
        <label className="eyebrow" htmlFor="barcode">
          Barcode
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="barcode"
            value={value.barcode}
            onChange={(event) => set({ barcode: event.target.value })}
            inputMode="numeric"
            autoComplete="off"
            placeholder="Leave empty for loose items"
            className="field tnum flex-1"
          />
          <button
            type="button"
            onClick={() => {
              primeAudio();
              setScanning(true);
            }}
            aria-label="Scan a barcode"
            className="btn btn-ghost px-4"
          >
            <ScanIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div>
        <label className="eyebrow" htmlFor="name">
          {variantShelf ? `Step 1 · ${variantShelf.baseLabel}` : 'Name'}
        </label>
        <input
          id="name"
          value={value.name}
          onChange={(event) => set({ name: event.target.value })}
          placeholder={variantShelf ? 'Al Fakher' : 'What is on the label'}
          list={variantShelf ? 'known-brands' : undefined}
          className="field mt-2"
          required
        />
        {variantShelf && knownBrands.length > 0 && (
          <datalist id="known-brands">
            {knownBrands.map((brand) => (
              <option key={brand} value={brand} />
            ))}
          </datalist>
        )}
      </div>

      <div>
        <p className="eyebrow">Category</p>
        <div className="strip -mx-4 mt-2 px-4 pb-1">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className="chip"
              data-active={value.categoryId === category.id}
              onClick={() => {
                const next = value.categoryId === category.id ? null : category.id;
                const keeps = categories.find((c) => c.id === next)?.hasVariants ?? false;
                set({
                  categoryId: next,
                  ...(keeps ? {} : { variantSize: '', variantTrait: '' }),
                });
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
      </div>

      {variantShelf && (
        <div>
          {/*
            Asked in the order the shop asks for it over the counter: brand, then taste, then
            weight. The till walks the same three steps in the same order, so entering an
            article and finding it later are the same journey.
          */}
          <p className="eyebrow">
            Step 2 &middot; {variantShelf.traitLabel}
          </p>
          <input
            id="trait"
            value={value.variantTrait}
            onChange={(event) => set({ variantTrait: event.target.value })}
            placeholder="Double Apple"
            list="known-tastes"
            className="field mt-2"
          />
          {/* Existing tastes for this brand, offered rather than imposed: a new taste is
              still just typed, but an existing one is picked and spelled the same way. */}
          <datalist id="known-tastes">
            {knownTastes.map((taste) => (
              <option key={taste} value={taste} />
            ))}
          </datalist>
          {knownTastes.length > 0 && (
            <div className="strip -mx-4 mt-2 px-4 pb-1">
              {knownTastes.map((taste) => (
                <button
                  key={taste}
                  type="button"
                  className="chip"
                  data-active={value.variantTrait.trim() === taste}
                  onClick={() =>
                    set({ variantTrait: value.variantTrait.trim() === taste ? '' : taste })
                  }
                >
                  {taste}
                </button>
              ))}
            </div>
          )}

          <p className="eyebrow mt-4">Step 3 &middot; Weight</p>
          <div className="strip -mx-4 mt-2 px-4 pb-1">
            {variantShelf.variantSizes.map((size) => (
              <button
                key={size}
                type="button"
                className="chip"
                data-active={value.variantSize === size}
                onClick={() => set({ variantSize: value.variantSize === size ? '' : size })}
              >
                {size}
              </button>
            ))}
          </div>

          {/* Shown because the article is filed under the assembled name, and a name that
              appears only after saving is a name nobody checked. */}
          {assembled.trim() !== '' && (
            <p className="mt-3 rounded-xl bg-[var(--color-ink)] px-3 py-2 text-xs leading-relaxed text-[var(--color-muted)]">
              Filed as <b className="text-[var(--color-paper)]">{assembled}</b>
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:gap-4">
        <div>
          <label className="eyebrow" htmlFor="cost">
            Cost price
          </label>
          <input
            id="cost"
            value={value.costPrice}
            onChange={(event) => set({ costPrice: event.target.value })}
            inputMode="decimal"
            placeholder="0.00"
            className="field tnum mt-2"
          />
        </div>
        <div>
          <label className="eyebrow" htmlFor="price">
            Sale price
          </label>
          <input
            id="price"
            value={value.salePrice}
            onChange={(event) => set({ salePrice: event.target.value })}
            inputMode="decimal"
            placeholder="0.00"
            className="field tnum mt-2"
          />
        </div>
      </div>

      {margin && (
        <div
          className="rounded-2xl border px-4 py-3"
          style={{
            borderColor: margin.profit.isNegative() ? 'var(--color-danger)' : 'var(--color-line)',
            background: margin.profit.isNegative()
              ? 'var(--color-danger-dim)'
              : 'var(--color-ink-raised)',
          }}
        >
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--color-muted)]">
              {margin.profit.isNegative() ? 'Sold at a loss' : 'Profit per unit'}
            </span>
            <span
              className="tnum font-bold"
              style={{
                color: margin.profit.isNegative() ? 'var(--color-danger)' : 'var(--color-gain)',
              }}
            >
              {margin.profit.format()} &middot; {margin.percent.toFixed(0)}%
            </span>
          </div>
          <p className="tnum mt-1 text-[11px] tracking-[0.06em] text-[var(--color-faint)]">
            Sells for {rate.formatLbp(margin.price)}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {showQuantity && (
          <div>
            <label className="eyebrow" htmlFor="quantity">
              Quantity in stock
            </label>
            <input
              id="quantity"
              value={value.quantity}
              onChange={(event) => set({ quantity: event.target.value })}
              inputMode="decimal"
              placeholder="0"
              className="field tnum mt-2"
            />
          </div>
        )}
        <div>
          <label className="eyebrow" htmlFor="low">
            Alert me below
          </label>
          <input
            id="low"
            value={value.lowStockThreshold}
            onChange={(event) => set({ lowStockThreshold: event.target.value })}
            inputMode="decimal"
            placeholder="0"
            className="field tnum mt-2"
          />
        </div>
      </div>

      {showQuantity && !openingCost.isZero() && (
        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-ink-raised)] px-4 py-3">
          <p className="text-sm font-semibold">
            This stock costs {openingCost.format()}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-faint)]">
            Filling a shelf is money leaving someone&rsquo;s pocket, so the books should say whose.
          </p>

          <p className="eyebrow mt-3">Paid for with</p>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <PaidWith
              label="Shop money"
              detail={budget ? `${budget.balance.format()} available` : 'Loading...'}
              selected={value.funding === 'budget'}
              onSelect={() => set({ funding: 'budget' })}
            />
            <PaidWith
              label="My own money"
              detail="Recorded as put in"
              selected={value.funding === 'outside'}
              onSelect={() => set({ funding: 'outside' })}
            />
          </div>

          {shortfall && budget && (
            <p
              className="mt-2 rounded-xl bg-[var(--color-danger-dim)] px-3 py-2 text-xs font-medium leading-relaxed text-[var(--color-danger)]"
              role="alert"
            >
              The shop has {budget.balance.format()} and this costs {openingCost.format()}.
              Pay for it yourself with <b>My own money</b>, or start with less stock.
            </p>
          )}

          {value.funding === 'outside' && (
            <p className="mt-2 text-xs leading-relaxed text-[var(--color-faint)]">
              The budget stays where it is, and {openingCost.format()} is recorded as money you
              put in from outside.
            </p>
          )}
        </div>
      )}

      <div>
        <p className="eyebrow">Sold by</p>
        <div className="strip -mx-4 mt-2 px-4 pb-1">
          {UNITS.map((unit) => (
            <button
              key={unit}
              type="button"
              className="chip"
              data-active={value.unit === unit}
              onClick={() => set({ unit })}
            >
              {unit}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="eyebrow" htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          value={value.notes}
          onChange={(event) => set({ notes: event.target.value })}
          rows={2}
          placeholder="Brand, size, supplier, anything worth remembering"
          className="field mt-2 resize-none"
        />
      </div>

      <ScannerSheet
        open={scanning}
        onClose={() => setScanning(false)}
        onDetect={(code) => {
          set({ barcode: code });
          setScanning(false);
        }}
        title="Scan the barcode"
      />
    </div>
  );
}

function PaidWith({
  label,
  detail,
  selected,
  onSelect,
}: {
  label: string;
  detail: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="min-h-16 rounded-2xl border px-3 py-2 text-left"
      style={{
        borderColor: selected ? 'var(--color-stock)' : 'var(--color-line)',
        background: selected ? 'var(--color-stock-dim)' : 'transparent',
      }}
    >
      <span className="block text-sm font-semibold">{label}</span>
      <span className="tnum mt-0.5 block text-xs text-[var(--color-faint)]">{detail}</span>
    </button>
  );
}
