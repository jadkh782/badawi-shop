'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import type { ProductFormInput } from '@/application/use-cases';
import { container } from '@/container';
import { messageFor } from '@/infrastructure/supabase/errors';
import { useToast } from '@/presentation/providers/ToastProvider';
import { AppShell } from '@/presentation/components/AppShell';
import { ProductForm, emptyForm } from '@/presentation/components/ProductForm';

/**
 * Adding an article.
 *
 * Arriving here from a scan carries the barcode across, because the common case is standing
 * at a shelf with an unrecognised item in hand: the code is already known, and retyping it
 * is the one thing guaranteed to introduce a mistake.
 */
function NewProduct() {
  const router = useRouter();
  const params = useSearchParams();
  const { notify } = useToast();

  const cameFromSell = params.get('from') === 'sell';
  const [form, setForm] = useState<ProductFormInput>(() => emptyForm(params.get('barcode') ?? ''));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const product = await container().saveProduct.create(form);
      notify(`${product.name} added`, 'success');
      // Coming from the till means there is a customer waiting, so go straight back to it.
      router.replace(cameFromSell ? '/sell' : `/inventory/item?id=${product.id}`);
    } catch (error) {
      notify(messageFor(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="New article"
      mode="stock"
      back={cameFromSell ? '/sell' : '/inventory'}
      footer={
        <button
          type="button"
          className="btn btn-stock w-full"
          disabled={busy || form.name.trim() === ''}
          onClick={() => void save()}
        >
          {busy ? 'Saving...' : 'Save article'}
        </button>
      }
    >
      <ProductForm value={form} onChange={setForm} showQuantity />
    </AppShell>
  );
}

export default function NewProductPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh" aria-busy="true" />}>
      <NewProduct />
    </Suspense>
  );
}
