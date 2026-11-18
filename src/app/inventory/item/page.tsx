'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Money, type Product } from '@/domain';
import type { ProductFormInput } from '@/application/use-cases';
import { container } from '@/container';
import { messageFor } from '@/infrastructure/supabase/errors';
import { useToast } from '@/presentation/providers/ToastProvider';
import { AppShell } from '@/presentation/components/AppShell';
import { ProductForm, formFrom } from '@/presentation/components/ProductForm';
import { RestockSheet } from '@/presentation/components/RestockSheet';
import { Sheet } from '@/presentation/components/Sheet';
import { PriceHistory } from '@/presentation/components/PriceHistory';
import { useSettings } from '@/presentation/providers/SettingsProvider';

/**
 * Editing an article.
 *
 * The article is addressed by a query parameter rather than a path segment, so the whole app
 * exports as static files. That is what lets the identical build be served from any host and
 * packaged inside the Android app.
 *
 * Stock is not editable here. It moves through Restock, which writes a ledger entry saying
 * what changed and why, so a count that looks wrong later can always be traced. Letting the
 * form overwrite it silently would make that history a fiction.
 */
function EditProduct() {
  const router = useRouter();
  const search = useSearchParams();
  const id = search.get('id') ?? '';
  const { notify } = useToast();
  const { settings } = useSettings();

  const [product, setProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [restocking, setRestocking] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [copies, setCopies] = useState<number | null>(null);
  const [notFound, setNotFound] = useState(false);
  // Bumped after a delivery so the price trail below picks up the row it just wrote.
  const [reloadKey, setReloadKey] = useState(0);

  async function load() {
    try {
      const found = await container().products.findById(id);
      if (!found) {
        setNotFound(true);
        return;
      }
      setProduct(found);
      setForm(formFrom(found));
    } catch (error) {
      notify(messageFor(error), 'error');
    }
  }

  useEffect(() => {
    void load();
    // Reloading on id alone is right: the toast helper is stable and load has no other input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      await container().saveProduct.update(id, form);
      notify('Article saved', 'success');
      router.push('/inventory');
    } catch (error) {
      notify(messageFor(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function printLabel(howMany: number) {
    if (!product) return;
    setCopies(null);
    setPrinting(true);
    try {
      const outcome = await container().receipts.label(product, settings, howMany);
      if (outcome === 'unavailable') {
        notify(
          product.barcode ? 'No printer could be reached' : 'This article has no barcode yet',
          'error',
        );
      }
    } catch (error) {
      notify(messageFor(error), 'error');
    } finally {
      setPrinting(false);
    }
  }

  async function archive() {
    if (!product) return;
    setBusy(true);
    try {
      const result = await container().products.archive(product.id);
      const back = Money.fromCents(result.valueCents);
      notify(
        // Money moving is worth saying out loud. Removing an article that still held stock
        // puts what it cost back in the budget, and a silent balance change is the kind of
        // thing that gets noticed a week later and cannot be explained.
        back.isZero()
          ? `${product.name} removed from inventory`
          : `${product.name} removed, ${back.format()} back in the budget`,
        'success',
      );
      router.push('/inventory');
    } catch (error) {
      notify(messageFor(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  /** What removing it would hand back, so the button can say so before it is tapped. */
  const refundOnRemoval = product ? product.costPrice.multiply(product.stock.value) : Money.zero();

  if (notFound) {
    return (
      <AppShell title="Not found" mode="stock" back="/inventory">
        <p className="px-6 py-16 text-center text-sm text-[var(--color-muted)]">
          That article is no longer in the inventory.
        </p>
      </AppShell>
    );
  }

  if (!product || !form) {
    return <AppShell title="Article" mode="stock" back="/inventory"><div aria-busy="true" /></AppShell>;
  }

  return (
    <>
      <AppShell
        title={product.name}
        mode="stock"
        back="/inventory"
        footer={
          <button
            type="button"
            className="btn btn-stock w-full"
            disabled={busy || form.name.trim() === ''}
            onClick={() => void save()}
          >
            {busy ? 'Saving...' : 'Save changes'}
          </button>
        }
      >
        <section className="border-b border-[var(--color-line)] px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">In stock</p>
              <p className="tnum mt-1 text-3xl font-bold">
                {product.stock.format()}
                <span className="ml-1.5 text-sm font-medium text-[var(--color-faint)]">
                  {product.unit}
                </span>
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {/* A generated barcode is only useful once it is somewhere a scanner can
                  reach, which on a receipt printer means a strip for the shelf edge. */}
              <button
                type="button"
                className="btn btn-ghost"
                disabled={printing}
                onClick={() => setCopies(Math.max(1, Math.floor(product.stock.value)))}
              >
                {printing ? '...' : 'Label'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setRestocking(true)}>
                Restock
              </button>
            </div>
          </div>

          {(product.isLowStock || product.isOutOfStock) && (
            <p
              className="mt-3 rounded-xl px-3 py-2 text-xs font-semibold"
              style={{
                background: product.isOutOfStock ? 'var(--color-danger-dim)' : 'var(--color-sell-dim)',
                color: product.isOutOfStock ? 'var(--color-danger)' : 'var(--color-sell)',
              }}
            >
              {product.isOutOfStock
                ? 'This shelf is empty. It cannot be sold until it is restocked.'
                : `At or below the alert level of ${product.lowStockThreshold.format()}.`}
            </p>
          )}
        </section>

        <PriceHistory product={product} reloadKey={reloadKey} />

        <ProductForm value={form} onChange={setForm} showQuantity={false} />

        <div className="px-4 pb-8">
          <button
            type="button"
            className="btn btn-danger w-full"
            disabled={busy}
            onClick={() => void archive()}
          >
            {refundOnRemoval.isZero()
              ? 'Remove from inventory'
              : `Remove, ${refundOnRemoval.format()} back`}
          </button>
          <p className="mt-2 text-center text-xs leading-relaxed text-[var(--color-faint)]">
            {refundOnRemoval.isZero()
              ? 'Past sales keep their own record, so reports stay correct.'
              : `The ${product.stock.format()} ${product.unit} still on the shelf cost ` +
                `${refundOnRemoval.format()}, which goes back into the budget. Past sales keep ` +
                'their own record, so reports stay correct.'}
          </p>
        </div>
      </AppShell>

      {copies !== null && product && (
        <Sheet open onClose={() => setCopies(null)} title={`Labels for ${product.name}`}>
          <p className="rounded-xl bg-[var(--color-ink)] px-3 py-3 text-xs leading-relaxed text-[var(--color-muted)]">
            {product.barcode
              ? 'Each label carries the name, the price and the barcode. They go to the label printer, not the till printer.'
              : 'This article has no barcode yet, so a label would have nothing to scan. Generate one first.'}
          </p>

          <p className="eyebrow mt-4">How many</p>
          <div className="mt-2 flex items-center justify-center gap-4">
            <button
              type="button"
              aria-label="One fewer"
              onClick={() => setCopies(Math.max(1, copies - 1))}
              disabled={copies <= 1}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[var(--color-line)] text-2xl font-bold text-[var(--color-muted)] disabled:opacity-30"
            >
              &minus;
            </button>
            <input
              value={copies}
              onChange={(event) => {
                const typed = Number(event.target.value.replace(/[^0-9]/g, ''));
                setCopies(Number.isFinite(typed) && typed > 0 ? Math.min(typed, 500) : 1);
              }}
              inputMode="numeric"
              aria-label="How many labels"
              className="field tnum w-24 text-center text-3xl font-bold"
            />
            <button
              type="button"
              aria-label="One more"
              onClick={() => setCopies(Math.min(500, copies + 1))}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[var(--color-line)] text-2xl font-bold text-[var(--color-muted)]"
            >
              +
            </button>
          </div>

          {/* The shelf count is the usual answer, so it is one tap rather than typing. */}
          <div className="strip -mx-4 mt-4 px-4 pb-1">
            {[1, 5, 10, Math.max(1, Math.floor(product.stock.value))]
              .filter((n, i, all) => all.indexOf(n) === i)
              .map((n) => (
                <button
                  key={n}
                  type="button"
                  className="chip"
                  data-active={copies === n}
                  onClick={() => setCopies(n)}
                >
                  {n === Math.max(1, Math.floor(product.stock.value)) && n !== 1
                    ? `${n} on the shelf`
                    : n}
                </button>
              ))}
          </div>

          <button
            type="button"
            className="btn btn-stock mb-2 mt-5 w-full"
            disabled={printing || !product.barcode}
            onClick={() => void printLabel(copies)}
          >
            {!product.barcode
              ? 'No barcode to print'
              : printing
                ? 'Printing...'
                : `Print ${copies} label${copies === 1 ? '' : 's'}`}
          </button>
        </Sheet>
      )}

      <RestockSheet
        open={restocking}
        product={product}
        onClose={() => setRestocking(false)}
        onDone={() => {
          setRestocking(false);
          setReloadKey((n) => n + 1);
          void load();
        }}
      />
    </>
  );
}

export default function EditProductPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh" aria-busy="true" />}>
      <EditProduct />
    </Suspense>
  );
}
