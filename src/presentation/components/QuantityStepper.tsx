'use client';

/**
 * Minus, count, plus.
 *
 * The buttons are set well apart because this is used with a thumb while holding an item in
 * the other hand, and a mis-tap here changes what the customer pays.
 */
export function QuantityStepper({
  value,
  unit,
  onDecrement,
  onIncrement,
  accent = 'var(--color-sell)',
}: {
  value: number;
  unit?: string;
  onDecrement: () => void;
  onIncrement: () => void;
  accent?: string;
}) {
  const label = Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '');

  return (
    <div className="flex items-center gap-1">
      <StepButton onClick={onDecrement} label="One fewer">
        &minus;
      </StepButton>
      <span className="tnum min-w-[3ch] text-center text-lg font-bold" style={{ color: accent }}>
        {label}
        {unit && unit !== 'piece' && (
          <span className="ml-0.5 text-[10px] font-medium text-[var(--color-faint)]">{unit}</span>
        )}
      </span>
      <StepButton onClick={onIncrement} label="One more">
        +
      </StepButton>
    </div>
  );
}

function StepButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-line)] bg-[var(--color-ink)] text-xl font-semibold text-[var(--color-paper)] active:scale-90"
      style={{ transition: 'transform 100ms ease' }}
    >
      {children}
    </button>
  );
}
