'use client';

import { useEffect, useState } from 'react';
import type { Cart, DiscountType, PaymentCurrency } from '@/domain';
import { DiscountFactory, Money } from '@/domain';
import { useSettings } from '@/presentation/providers/SettingsProvider';
import { Amount } from './Amount';
import { Sheet } from './Sheet';

/**
 * The last screen before money changes hands.
 *
 * The discount is previewed live against the real subtotal, and the total is shown in both
 * currencies at once so the cashier never has to convert in their head. Which currency was
 * actually handed over is recorded, because that is what makes the end-of-day cash count
 * reconcile.
 */
export function CheckoutSheet({
  open,
  onClose,
  cart,
  onDiscountChange,
  onConfirm,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  cart: Cart;
  onDiscountChange: (type: DiscountType, value: number) => void;
  onConfirm: (currency: PaymentCurrency, note: string | null) => void;
  busy: boolean;
}) {
  const { rate } = useSettings();
  const [type, setType] = useState<DiscountType>('none');
  const [raw, setRaw] = useState('');
  const [currency, setCurrency] = useState<PaymentCurrency>('USD');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setType(cart.discount.type);
    setRaw(cart.discount.value ? String(cart.discount.value) : '');
    setNote('');
  }, [open, cart.discount]);

  // The preview is built from the same strategy the sale will use, so what is shown here is
  // exactly what the database will recompute.
  const value = Number(raw.replace(',', '.')) || 0;
  const preview = (() => {
    try {
      return DiscountFactory.create(type, value).computeDiscount(cart.subtotal);
    } catch {
      return Money.zero();
    }
  })();
  const total = cart.subtotal.subtract(preview).clampToZero();
  const invalid = type === 'percent' && (value < 0 || value > 100);

  function apply(nextType: DiscountType, nextRaw: string) {
    setType(nextType);
    setRaw(nextRaw);
    const parsed = Number(nextRaw.replace(',', '.')) || 0;
    if (nextType === 'percent' && (parsed < 0 || parsed > 100)) return;
    onDiscountChange(nextType, parsed);
  }

  return (
    <Sheet open={open} onClose={onClose} title="Check out">
      <div className="card mb-4 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--color-muted)]">Subtotal</span>
          <span className="tnum font-semibold">{cart.subtotal.format()}</span>
        </div>

        {!preview.isZero() && (
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-[var(--color-sell)]">
              {DiscountFactory.create(type, value).describe()}
            </span>
            <span className="tnum font-semibold text-[var(--color-sell)]">
              &minus;{preview.format()}
            </span>
          </div>
        )}

        <div className="mt-4 border-t border-[var(--color-line)] pt-4">
          <p className="eyebrow">Total to pay</p>
          <div className="mt-2">
            <Amount value={total} size="hero" />
          </div>
        </div>
      </div>

      <p className="eyebrow mb-2">Discount</p>
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          className="chip flex-1 justify-center"
          data-active={type === 'none'}
          onClick={() => apply('none', '')}
        >
          None
        </button>
        <button
          type="button"
          className="chip flex-1 justify-center"
          data-active={type === 'percent'}
          onClick={() => apply('percent', raw || '10')}
        >
          Percent
        </button>
        <button
          type="button"
          className="chip flex-1 justify-center"
          data-active={type === 'amount'}
          onClick={() => apply('amount', raw || '1')}
        >
          Amount
        </button>
      </div>

      {type !== 'none' && (
        <div className="mb-4">
          <div className="flex items-center gap-2">
            {type === 'amount' && <span className="tnum text-xl font-bold">$</span>}
            <input
              value={raw}
              onChange={(event) => apply(type, event.target.value)}
              inputMode="decimal"
              autoFocus
              aria-label={type === 'percent' ? 'Discount percentage' : 'Discount amount in dollars'}
              className="field tnum flex-1 text-xl font-bold"
              placeholder="0"
            />
            {type === 'percent' && <span className="tnum text-xl font-bold">%</span>}
          </div>
          {invalid && (
            <p className="mt-2 text-sm font-medium text-[var(--color-danger)]" role="alert">
              A percentage discount has to be between 0 and 100.
            </p>
          )}
        </div>
      )}

      <p className="eyebrow mb-2">Paid in</p>
      <div className="mb-4 flex gap-2">
        <CurrencyOption
          active={currency === 'USD'}
          onClick={() => setCurrency('USD')}
          label="US dollars"
          figure={total.format()}
        />
        <CurrencyOption
          active={currency === 'LBP'}
          onClick={() => setCurrency('LBP')}
          label="Lebanese pounds"
          figure={rate.formatLbp(total)}
        />
      </div>

      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Note (optional)"
        aria-label="Note"
        className="field mb-4"
      />

      <button
        type="button"
        className="btn btn-sell mb-2 w-full text-lg"
        disabled={busy || cart.isEmpty || invalid}
        onClick={() => onConfirm(currency, note.trim() || null)}
      >
        {busy ? 'Recording...' : `Take ${currency === 'USD' ? total.format() : rate.formatLbp(total)}`}
      </button>
    </Sheet>
  );
}

function CurrencyOption({
  active,
  onClick,
  label,
  figure,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  figure: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex flex-1 flex-col items-start gap-1 rounded-2xl border p-3 text-left"
      style={{
        borderColor: active ? 'var(--color-sell)' : 'var(--color-line)',
        background: active ? 'var(--color-sell-dim)' : 'var(--color-ink)',
      }}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-muted)]">
        {label}
      </span>
      <span className="tnum text-base font-bold">{figure}</span>
    </button>
  );
}
