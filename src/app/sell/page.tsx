'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import type { DiscountType, PaymentCurrency, Product, StockBatch } from '@/domain';
import { InsufficientStockError } from '@/domain';
import { container } from '@/container';
import { messageFor } from '@/infrastructure/supabase/errors';
import { useCart } from '@/presentation/hooks/useCart';
import { useKeyboardWedge } from '@/presentation/hooks/useScanner';
import { beepFound, beepUnknown, buzzError, primeAudio } from '@/presentation/hooks/feedback';
import { useToast } from '@/presentation/providers/ToastProvider';
import { AppShell } from '@/presentation/components/AppShell';
import { Amount } from '@/presentation/components/Amount';
import { ScannerSheet } from '@/presentation/components/ScannerSheet';
import { ProductPicker } from '@/presentation/components/ProductPicker';
import { CheckoutSheet } from '@/presentation/components/CheckoutSheet';
import { QuantityStepper } from '@/presentation/components/QuantityStepper';
import { ScanIcon, SearchIcon } from '@/presentation/components/Icons';
import { SaleComplete } from '@/presentation/components/SaleComplete';
import { BatchPicker } from '@/presentation/components/BatchPicker';
import { ScanHint, EmptyCart } from '@/presentation/components/SellPieces';
import { useSettings } from '@/presentation/providers/SettingsProvider';

/**
 * Sell mode.
 *
 * The cart stays on screen at all times and the three things you can do to it sit in the
 * bottom bar, in thumb reach. Scanning does not close the camera, so a basket of twenty
 * items is twenty beeps and one tap.
 */
export default function SellPage() {
  const router = useRouter();
  const { notify } = useToast();
  const { settings } = useSettings();
  const { cart, add, increment, decrement, remove, setDiscount, clear } = useCart();

  const [scanning, setScanning] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(0);
  const [lastAdded, setLastAdded] = useState<Product | null>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [completed, setCompleted] = useState<string | null>(null);
  // Set only while the till is asking which purchase price is going over the counter.
  const [choosingBatch, setChoosingBatch] = useState<{
    product: Product;
    batches: StockBatch[];
  } | null>(null);

  // Guards against the same code being handled twice while its lookup is still in flight.
  const pending = useRef<Set<string>>(new Set());

  /**
   * Puts an article in the basket, asking which price it came off first when it has to.
   *
   * Only has to when the shop keeps delivery prices apart and this article is holding stock
   * from more than one. Every other time it goes straight in, which is every time in average
   * mode and most times even in batch mode.
   */
  const addProduct = useCallback(
    async (product: Product) => {
      if (!settings.tracksPricesSeparately) {
        add(product);
        return true;
      }

      try {
        const batches = await container().products.batches(product.id);
        if (batches.length > 1) {
          setChoosingBatch({ product, batches });
          return false;
        }
        add(product, 1, batches[0] ?? null);
      } catch {
        // The batches are a refinement on the cost, not a precondition for selling. If they
        // cannot be read, the sale still goes through and the database costs it oldest first.
        add(product);
      }
      return true;
    },
    [add, settings.tracksPricesSeparately],
  );

  const handleCode = useCallback(
    async (code: string) => {
      if (pending.current.has(code)) return;
      pending.current.add(code);

      try {
        const product = await container().findProductByBarcode.execute(code);

        if (!product) {
          beepUnknown();
          setUnknownCode(code);
          return;
        }

        if (product.isOutOfStock) {
          buzzError();
          notify(`${product.name} has none left in stock`, 'error');
          return;
        }

        const added = await addProduct(product);
        setLastAdded(product);
        setUnknownCode(null);
        setFlash(Date.now());
        // A basket that has stopped to ask a question has not been added to yet, so the
        // confirming beep would be a lie.
        if (added) beepFound();
      } catch (error) {
        buzzError();
        notify(messageFor(error), 'error');
      } finally {
        pending.current.delete(code);
      }
    },
    [addProduct, notify],
  );

  // A hardware scanner works anywhere in Sell mode, with no camera and nothing to switch on.
  useKeyboardWedge(!scanning && !completed, (code) => void handleCode(code));

  async function confirm(currency: PaymentCurrency, note: string | null) {
    setBusy(true);
    try {
      const saleId = await container().checkoutSale.execute(cart, currency, note);
      setCheckingOut(false);
      setCompleted(saleId);
      clear();
    } catch (error) {
      buzzError();
      // A stock refusal is the one error worth spelling out: it names the article and how
      // many are actually left, which tells the cashier what to do next.
      notify(error instanceof InsufficientStockError ? error.message : messageFor(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (completed) {
    return (
      <SaleComplete
        saleId={completed}
        onNewSale={() => {
          setCompleted(null);
          setLastAdded(null);
        }}
        onDone={() => router.push('/')}
      />
    );
  }

  return (
    <>
      <AppShell
        title="Sell"
        mode="sell"
        back="/"
        action={
          !cart.isEmpty ? (
            <button
              type="button"
              onClick={clear}
              className="-mr-2 flex min-h-11 items-center px-2 text-sm font-semibold text-[var(--color-faint)]"
            >
              Clear
            </button>
          ) : null
        }
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setBrowsing(true)}
              className="btn btn-ghost px-4"
              aria-label="Browse items by category"
            >
              <SearchIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                primeAudio();
                setScanning(true);
              }}
              className="btn btn-ghost flex-1"
            >
              <ScanIcon className="h-5 w-5" />
              Scan
            </button>
            <button
              type="button"
              onClick={() => setCheckingOut(true)}
              disabled={cart.isEmpty}
              className="btn btn-sell flex-1"
            >
              Check out
            </button>
          </div>
        }
      >
        <section className="border-b border-[var(--color-line)] px-4 py-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Total</p>
              <div className="mt-2">
                <Amount value={cart.total} size="hero" />
              </div>
            </div>
            <p className="tnum pb-1 text-sm font-semibold text-[var(--color-muted)]">
              {cart.itemCount === 0
                ? 'empty'
                : `${formatCount(cart.itemCount)} item${cart.itemCount === 1 ? '' : 's'}`}
            </p>
          </div>

          {!cart.discountAmount.isZero() && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--color-sell-dim)] px-3 py-1.5 text-xs font-semibold text-[var(--color-sell)]">
              {cart.discount.describe()} &middot; saves {cart.discountAmount.format()}
            </p>
          )}
        </section>

        {cart.isEmpty ? (
          <EmptyCart onScan={() => setScanning(true)} onBrowse={() => setBrowsing(true)} />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {cart.lines.map((line) => (
              <li key={line.key} className="px-4 py-3">
                {/*
                  The name gets the full width on its own line. Sharing a row with the
                  stepper, the price and the remove button left it about a hundred pixels on a
                  phone, which turns "Coca Cola 1L" into "Coca Col..." - useless when the
                  shelf holds three sizes of it.
                */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug">{line.product.name}</p>
                    {/* Two rows of the same article are only distinguishable by what they
                        cost, so the row has to say which one it is. */}
                    {line.batch && (
                      <p className="tnum mt-0.5 text-[11px] text-[var(--color-faint)]">
                        bought at {line.batch.unitCost.format()}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(line.key)}
                    aria-label={`Remove ${line.product.name}`}
                    className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center text-lg text-[var(--color-faint)]"
                  >
                    &times;
                  </button>
                </div>

                <div className="mt-2 flex items-end justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <QuantityStepper
                      value={line.quantity.value}
                      unit={line.product.unit}
                      onDecrement={() => decrement(line.key)}
                      onIncrement={() => increment(line.key)}
                    />
                    <span className="tnum text-xs text-[var(--color-faint)]">
                      {line.unitPrice.format()} each
                    </span>
                  </div>
                  <Amount value={line.lineTotal} size="sm" className="items-end" />
                </div>

                {line.exceedsStock && (
                  <p className="mt-2 text-xs font-semibold text-[var(--color-sell)]">
                    Only {formatCount(line.available)} {line.product.unit}
                    {line.batch ? ' left at that price' : ' in stock'}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </AppShell>

      <ScannerSheet
        open={scanning}
        onClose={() => setScanning(false)}
        onDetect={(code) => void handleCode(code)}
        title="Scan to sell"
        flash={flash}
        hint={
          <ScanHint
            lastAdded={lastAdded}
            unknownCode={unknownCode}
            onAddUnknown={(code) => {
              setScanning(false);
              setUnknownCode(null);
              router.push(`/inventory/new?barcode=${encodeURIComponent(code)}&from=sell`);
            }}
            onDismissUnknown={() => setUnknownCode(null)}
          />
        }
      />

      <ProductPicker
        open={browsing}
        onClose={() => setBrowsing(false)}
        onPick={(product) => {
          setBrowsing(false);
          void addProduct(product).then((added) => {
            setLastAdded(product);
            if (added) beepFound();
          });
        }}
      />

      {choosingBatch && (
        <BatchPicker
          open
          product={choosingBatch.product}
          batches={choosingBatch.batches}
          onClose={() => setChoosingBatch(null)}
          onPick={(batch) => {
            add(choosingBatch.product, 1, batch);
            beepFound();
            setChoosingBatch(null);
          }}
        />
      )}

      <CheckoutSheet
        open={checkingOut}
        onClose={() => setCheckingOut(false)}
        cart={cart}
        onDiscountChange={(type: DiscountType, value: number) => setDiscount(type, value)}
        onConfirm={(currency, note) => void confirm(currency, note)}
        busy={busy}
      />
    </>
  );
}

function formatCount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
