'use client';

import { useEffect, useMemo, useState } from 'react';
import { BudgetSummary, Money, type Product } from '@/domain';
import type { RestockFunding } from '@/application/ports';
import { RestockProduct } from '@/application/use-cases';
import { container } from '@/container';
import { messageFor } from '@/infrastructure/supabase/errors';
import { useToast } from '@/presentation/providers/ToastProvider';
import { Sheet } from './Sheet';

const QUICK = [1, 6, 12, 24];

/** What to do about the shelf price when the supplier moves theirs. */
type PriceAnswer = 'margin' | 'custom' | 'leave';

/**
 * Moving stock.
 *
 * Two reasons, kept apart on purpose: a delivery adds to what is there, a correction sets it
 * to what is actually on the shelf. Both write a ledger entry, so a count that looks wrong
 * next month can be traced to the moment it changed, and both now move money, because a
 * miscount is the shop discovering it was wrong about what it owned.
 *
 * A delivery is priced per unit rather than as a lump sum, because "twelve at $1.75" is what
 * the invoice says. It also makes the question worth asking askable: when that figure is not
 * what it was last time, the sheet stops and asks what the shelf price should do about it,
 * rather than quietly eating the difference out of the margin for the next six months.
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
  const [unitCost, setUnitCost] = useState('');
  const [funding, setFunding] = useState<RestockFunding>('budget');
  const [budget, setBudget] = useState<BudgetSummary | null>(null);
  const [busy, setBusy] = useState(false);

  // What to do about the shelf price. Null until the cost actually moves, at which point the
  // sheet asks rather than deciding.
  const [priceAnswer, setPriceAnswer] = useState<PriceAnswer | null>(null);
  const [customPrice, setCustomPrice] = useState('');

  useEffect(() => {
    if (!open) return;
    setMode('restock');
    setRaw('');
    setNote('');
    // Prefilled with what the article costs, so leaving it alone says "same as last time"
    // and changing it is a deliberate act.
    setUnitCost(product.costPrice.dollars.toFixed(2));
    setFunding('budget');
    setPriceAnswer(null);
    setCustomPrice('');
    // What is in the cash box decides whether this delivery can be paid for out of it, so it
    // belongs on this screen rather than one the shop has to go and look at first.
    void container()
      .getBudget.execute(0)
      .then((view) => setBudget(view.summary))
      .catch(() => setBudget(null));
  }, [open, product]);

  const entered = Number(raw.replace(',', '.'));
  const valid = Number.isFinite(entered) && raw.trim() !== '';
  const current = product.stock.value;
  const result = mode === 'restock' ? current + entered : entered;
  const delta = mode === 'restock' ? entered : entered - current;
  const isDelivery = mode === 'restock' && entered > 0;

  const paidPerUnit = useMemo(() => {
    try {
      return unitCost.trim() ? Money.fromInput(unitCost) : product.costPrice;
    } catch {
      return product.costPrice;
    }
  }, [unitCost, product.costPrice]);

  const priceMoved = isDelivery && !paidPerUnit.equals(product.costPrice);
  const deliveryCost = isDelivery ? paidPerUnit.multiply(entered) : Money.zero();

  // What the article will cost once this delivery is blended in. Shown so the shop can see
  // that ten at $20 on top of ten at $15 does not simply become $20.
  const blended = useMemo(() => {
    if (!isDelivery || current <= 0) return paidPerUnit;
    const total = product.costPrice.multiply(current).add(paidPerUnit.multiply(entered));
    return Money.fromCents(Math.round(total.cents / (current + entered)));
  }, [isDelivery, current, entered, paidPerUnit, product.costPrice]);

  const heldMargin = RestockProduct.priceHoldingMargin(product, blended);

  const newSalePrice =
    priceAnswer === 'margin'
      ? heldMargin.dollars.toFixed(2)
      : priceAnswer === 'custom'
        ? customPrice
        : undefined;

  const paysFromBudget = isDelivery && funding === 'budget';
  const shortfall = paysFromBudget && budget ? !budget.canAfford(deliveryCost) : false;
  // A price change is a decision, and an unanswered decision is not a reason to guess.
  const awaitingPriceAnswer = priceMoved && priceAnswer === null;

  // A correction is not a purchase, but it does move money: found stock was paid for by
  // someone, missing stock never really left the till.
  const correctionValue =
    mode === 'adjustment' && valid && delta !== 0 ? product.costPrice.multiply(Math.abs(delta)) : null;

  async function apply() {
    setBusy(true);
    try {
      await container().restockProduct.execute({
        productId: product.id,
        delta,
        reason: mode,
        unitCost: isDelivery ? unitCost : undefined,
        newSalePrice: newSalePrice,
        funding,
        note: note.trim() || undefined,
      });
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

      {correctionValue && !correctionValue.isZero() && (
        <p className="mt-3 rounded-xl bg-[var(--color-ink-raised)] px-3 py-2.5 text-xs leading-relaxed text-[var(--color-muted)]">
          {delta > 0 ? (
            <>
              {formatStock(delta)} {product.unit} more than the books said. Someone paid for
              them, so <b>{correctionValue.format()}</b> comes out of the budget.
            </>
          ) : (
            <>
              {formatStock(-delta)} {product.unit} fewer than the books said. They were never
              really bought, so <b>{correctionValue.format()}</b> goes back into the budget.
            </>
          )}
        </p>
      )}

      {isDelivery && (
        <div className="mt-4 border-t border-[var(--color-line)] pt-4">
          <label className="eyebrow" htmlFor="unit-cost">
            Price paid per {product.unit}
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-lg font-semibold text-[var(--color-faint)]">$</span>
            <input
              id="unit-cost"
              value={unitCost}
              onChange={(event) => {
                setUnitCost(event.target.value);
                // The question is about this price, so a new price asks it again.
                setPriceAnswer(null);
              }}
              inputMode="decimal"
              placeholder={product.costPrice.dollars.toFixed(2)}
              className="field tnum flex-1"
            />
          </div>
          <p className="tnum mt-1.5 text-xs text-[var(--color-faint)]">
            {entered} {product.unit} &times; {paidPerUnit.format()} ={' '}
            <b className="text-[var(--color-muted)]">{deliveryCost.format()}</b>
            {product.lastCostPrice && !product.lastCostPrice.equals(paidPerUnit)
              ? ` · last time ${product.lastCostPrice.format()}`
              : ''}
          </p>

          {priceMoved && (
            <PriceChangePrompt
              product={product}
              paid={paidPerUnit}
              blended={blended}
              heldMargin={heldMargin}
              answer={priceAnswer}
              onAnswer={setPriceAnswer}
              customPrice={customPrice}
              onCustomPrice={setCustomPrice}
            />
          )}

          <p className="eyebrow mt-4">Paid for with</p>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <FundingChoice
              label="Shop money"
              detail={budget ? `${budget.balance.format()} available` : 'Loading...'}
              selected={funding === 'budget'}
              onSelect={() => setFunding('budget')}
            />
            <FundingChoice
              label="My own money"
              detail="Recorded as put in"
              selected={funding === 'outside'}
              onSelect={() => setFunding('outside')}
            />
          </div>

          {shortfall && budget && (
            <p
              className="mt-2 rounded-xl bg-[var(--color-danger-dim)] px-3 py-2 text-xs font-medium leading-relaxed text-[var(--color-danger)]"
              role="alert"
            >
              The shop has {budget.balance.format()} and this costs {deliveryCost.format()}.
              Pay for it yourself with <b>My own money</b>, or order less.
            </p>
          )}

          {funding === 'outside' && (
            <p className="mt-2 text-xs leading-relaxed text-[var(--color-faint)]">
              The budget stays where it is, and {deliveryCost.format()} is recorded as money you
              put in from outside.
            </p>
          )}
        </div>
      )}

      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={mode === 'restock' ? 'Supplier or invoice (optional)' : 'Why (optional)'}
        aria-label="Note"
        className="field mt-4"
      />

      <button
        type="button"
        className="btn btn-stock mb-2 mt-4 w-full"
        // The shop cannot spend money it does not have. Paying from your own pocket is the
        // way through, so the button stays shut until one or the other is true.
        disabled={
          busy || !valid || result < 0 || delta === 0 || shortfall || awaitingPriceAnswer
        }
        onClick={() => void apply()}
      >
        {busy
          ? 'Saving...'
          : shortfall
            ? 'Not enough in the budget'
            : awaitingPriceAnswer
              ? 'Choose what the price should do'
              : mode === 'restock'
                ? 'Add to stock'
                : 'Correct the count'}
      </button>
    </Sheet>
  );
}

/**
 * The price moved. What should the shelf do about it?
 *
 * Deliberately a stop rather than a hint. A cost that rises and a shelf price that does not
 * is a margin quietly draining away, and the moment it is noticeable is months later; this is
 * the one moment the shop is holding the invoice and knows the answer.
 */
function PriceChangePrompt({
  product,
  paid,
  blended,
  heldMargin,
  answer,
  onAnswer,
  customPrice,
  onCustomPrice,
}: {
  product: Product;
  paid: Money;
  blended: Money;
  heldMargin: Money;
  answer: PriceAnswer | null;
  onAnswer: (next: PriceAnswer) => void;
  customPrice: string;
  onCustomPrice: (next: string) => void;
}) {
  const wentUp = paid.greaterThan(product.costPrice);
  const marginNow = product.salePrice.subtract(blended);
  const marginPercent = product.salePrice.isZero()
    ? null
    : (marginNow.cents / product.salePrice.cents) * 100;

  return (
    <div
      className="mt-4 rounded-2xl border px-4 py-3"
      style={{
        borderColor: answer === null ? 'var(--color-sell)' : 'var(--color-line)',
        background: answer === null ? 'var(--color-sell-dim)' : 'var(--color-ink-raised)',
      }}
    >
      <p className="text-sm font-semibold">
        The price {wentUp ? 'went up' : 'came down'}: {product.costPrice.format()} &rarr;{' '}
        {paid.format()}
      </p>

      {!blended.equals(paid) && (
        <p className="tnum mt-1 text-xs leading-relaxed text-[var(--color-faint)]">
          You still hold stock bought at the old price, so this article now costs{' '}
          <b className="text-[var(--color-muted)]">{blended.format()}</b> on average.
        </p>
      )}

      <p className="tnum mt-1 text-xs leading-relaxed text-[var(--color-faint)]">
        At {product.salePrice.format()} that leaves {marginNow.format()}
        {marginPercent === null ? '' : ` · ${marginPercent.toFixed(0)}%`} a {product.unit}
        {marginNow.isNegative() ? ', which is a loss' : ''}.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        <PriceOption
          selected={answer === 'margin'}
          onSelect={() => onAnswer('margin')}
          label="Keep the same margin"
          detail={`Sell at ${heldMargin.format()} instead of ${product.salePrice.format()}`}
        />
        <PriceOption
          selected={answer === 'custom'}
          onSelect={() => onAnswer('custom')}
          label="Set a new price"
          detail="Decide what it should sell for"
        />
        <PriceOption
          selected={answer === 'leave'}
          onSelect={() => onAnswer('leave')}
          label="Leave the price alone"
          detail={`Keep selling at ${product.salePrice.format()}`}
        />
      </div>

      {answer === 'custom' && (
        <div className="mt-3">
          <label className="eyebrow" htmlFor="new-price">
            New sale price
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-lg font-semibold text-[var(--color-faint)]">$</span>
            <input
              id="new-price"
              value={customPrice}
              onChange={(event) => onCustomPrice(event.target.value)}
              inputMode="decimal"
              autoFocus
              placeholder={heldMargin.dollars.toFixed(2)}
              className="field tnum flex-1"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PriceOption({
  selected,
  onSelect,
  label,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="min-h-11 rounded-xl border px-3 py-2 text-left"
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

function formatStock(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '');
}

function FundingChoice({
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
