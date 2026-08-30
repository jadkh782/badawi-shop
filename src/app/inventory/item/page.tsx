'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import type { Product } from '@/domain';
import type { ProductFormInput } from '@/application/use-cases';
import { container } from '@/container';
import { messageFor } from '@/infrastructure/supabase/errors';
import { useToast } from '@/presentation/providers/ToastProvider';
import { AppShell } from '@/presentation/components/AppShell';
import { ProductForm, formFrom } from '@/presentation/components/ProductForm';
import { RestockSheet } from '@/presentation/components/RestockSheet';
import { PriceHistory } from '@/presentation/components/PriceHistory';

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

  const [product, setProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [restocking, setRestocking] = useState(false);
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

  async function archive() {
    if (!product) return;
    setBusy(true);
    try {
      await container().products.archive(product.id);
      notify(`${product.name} removed from inventory`, 'success');
      router.push('/inventory');
    } catch (error) {
      notify(messageFor(error), 'error');
    } finally {
      setBusy(false);
    }
  }

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
            <button type="button" className="btn btn-ghost" onClick={() => setRestocking(true)}>
              Restock
            </button>
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
          <button type="button" className="btn btn-danger w-full" onClick={() => void archive()}>
            Remove from inventory
          </button>
          <p className="mt-2 text-center text-xs text-[var(--color-faint)]">
            Past sales keep their own record, so reports stay correct.
          </p>
        </div>
      </AppShell>

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
