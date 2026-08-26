'use client';

import { useEffect, useState } from 'react';
import type { Product } from '@/domain';
import { container } from '@/container';
import { messageFor } from '@/infrastructure/supabase/errors';
import { useToast } from '@/presentation/providers/ToastProvider';
import { Sheet } from './Sheet';

const QUICK = [1, 6, 12, 24];

/**
 * Moving stock.
 *
 * Two reasons, kept apart on purpose: a delivery adds to what is there, a correction sets it
 * to what is actually on the shelf. Both write a ledger entry, so a count that looks wrong
 * next month can be traced to the moment it changed.
 */
export function RestockSheet({
  open,
  product,
  onClose,
  onDone,
}: {
  open: boolean;
  product: Product;
  onClose: () => void;
  onDone: () => void;
}) {
  const { notify } = useToast();
  const [mode, setMode] = useState<'restock' | 'adjustment'>('restock');
  const [raw, setRaw] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMode('restock');
      setRaw('');
      setNote('');
    }
  }, [open]);

  const entered = Number(raw.replace(',', '.'));
  const valid = Number.isFinite(entered) && raw.trim() !== '';
  const current = product.stock.value;
  const result = mode === 'restock' ? current + entered : entered;
  const delta = mode === 'restock' ? entered : entered - current;

  async function apply() {
    setBusy(true);
    try {
      await container().restockProduct.execute(product.id, delta, mode, note.trim() || undefined);
      notify(
        mode === 'restock'
          ? `Added ${entered} ${product.unit} of ${product.name}`
          : `${product.name} set to ${entered} ${product.unit}`,
        'success',
      );
      onDone();
    } catch (error) {
      notify(messageFor(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={product.name}>
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          className="chip flex-1 justify-center"
          data-active={mode === 'restock'}
          onClick={() => setMode('restock')}
        >
          Delivery
        </button>
        <button
          type="button"
          className="chip flex-1 justify-center"
          data-active={mode === 'adjustment'}
          onClick={() => setMode('adjustment')}
        >
          Correction
        </button>
      </div>

      <label className="eyebrow" htmlFor="amount">
        {mode === 'restock' ? 'How many arrived' : 'How many are actually there'}
      </label>
      <input
        id="amount"
        value={raw}
        onChange={(event) => setRaw(event.target.value)}
        inputMode="decimal"
        autoFocus
        placeholder="0"
        className="field tnum mt-2 text-2xl font-bold"
      />

      {mode === 'restock' && (
        <div className="mt-3 flex gap-2">
          {QUICK.map((amount) => (
            <button
              key={amount}
              type="button"
              className="chip flex-1 justify-center"
              onClick={() => setRaw(String((Number(raw) || 0) + amount))}
            >
              +{amount}
            </button>
          ))}
        </div>
      )}

      <div className="card mt-4 flex items-center justify-between p-4">
        <span className="text-sm text-[var(--color-muted)]">New stock level</span>
        <span className="tnum text-xl font-bold">
          {valid ? formatStock(result) : product.stock.format()}
          <span className="ml-1.5 text-xs font-medium text-[var(--color-faint)]">
            {product.unit}
          </span>
        </span>
      </div>

      {valid && result < 0 && (
        <p className="mt-2 text-sm font-medium text-[var(--color-danger)]" role="alert">
          Stock cannot go below zero.
        </p>
      )}

      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={mode === 'restock' ? 'Supplier or invoice (optional)' : 'Why (optional)'}
        aria-label="Note"
        className="field mt-3"
      />

      <button
        type="button"
        className="btn btn-stock mb-2 mt-4 w-full"
        disabled={busy || !valid || result < 0 || delta === 0}
        onClick={() => void apply()}
      >
        {busy ? 'Saving...' : mode === 'restock' ? 'Add to stock' : 'Correct the count'}
      </button>
    </Sheet>
  );
}

function formatStock(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '');
}
