'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Category, Product } from '@/domain';
import { Money } from '@/domain';
import type { ProductFormInput } from '@/application/use-cases';
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
  };
}

export function formFrom(product: Product): ProductFormInput {
  return {
    barcode: product.barcode?.value ?? '',
    name: product.name,
    categoryId: product.categoryId,
    costPrice: product.costPrice.dollars.toFixed(2),
    salePrice: product.salePrice.dollars.toFixed(2),
    quantity: String(product.stock.value),
    lowStockThreshold: String(product.lowStockThreshold.value),
    unit: product.unit,
    notes: product.notes ?? '',
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
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    void container().categories.list().then(setCategories).catch(() => setCategories([]));
  }, []);

  const set = (patch: Partial<ProductFormInput>) => onChange({ ...value, ...patch });

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
          Name
        </label>
        <input
          id="name"
          value={value.name}
          onChange={(event) => set({ name: event.target.value })}
          placeholder="What is on the label"
          className="field mt-2"
          required
        />
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
              onClick={() =>
                set({ categoryId: value.categoryId === category.id ? null : category.id })
              }
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
