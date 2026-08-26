'use client';

import { useEffect, useState } from 'react';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

/**
 * A four-digit keypad.
 *
 * Deliberately not a text input: a numeric field on a phone brings up a keyboard that covers
 * half the screen and varies by device. Fixed keys are the same size and in the same place
 * every time, which is what makes a PIN muscle memory.
 */
export function PinPad({
  length = 4,
  onComplete,
  error,
  accent = 'var(--color-sell)',
}: {
  length?: number;
  onComplete: (pin: string) => void;
  error?: string | null;
  accent?: string;
}) {
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (pin.length !== length) return;
    const entered = pin;
    // Clear before handing over, so a wrong PIN leaves an empty pad ready for another try.
    setPin('');
    onComplete(entered);
  }, [pin, length, onComplete]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (/^[0-9]$/.test(event.key)) setPin((p) => (p.length < length ? p + event.key : p));
      if (event.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [length]);

  return (
    <div className="flex w-full flex-col items-center gap-5 sm:gap-7">
      <div
        className="flex gap-4"
        role="status"
        aria-label={`${pin.length} of ${length} digits entered`}
      >
        {Array.from({ length }, (_, index) => (
          <span
            key={index}
            className="h-4 w-4 rounded-full border-2 transition-colors"
            style={{
              borderColor: error ? 'var(--color-danger)' : accent,
              background: index < pin.length ? (error ? 'var(--color-danger)' : accent) : 'transparent',
            }}
          />
        ))}
      </div>

      {error && (
        <p className="-mt-2 text-center text-sm font-semibold text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      )}

      {/*
        The keys size themselves to the space available rather than to a fixed 68px, so a
        short screen shrinks them a little instead of pushing the bottom row off the end.
      */}
      <div className="grid w-full max-w-[288px] grid-cols-3 gap-2.5 sm:gap-3">
        {KEYS.map((key, index) =>
          key === '' ? (
            <span key={index} />
          ) : (
            <button
              key={index}
              type="button"
              onClick={() =>
                setPin((p) => (key === 'del' ? p.slice(0, -1) : p.length < length ? p + key : p))
              }
              aria-label={key === 'del' ? 'Delete' : key}
              className="tnum flex items-center justify-center rounded-2xl border border-[var(--color-line)] bg-[var(--color-ink-raised)] text-2xl font-semibold active:scale-95"
              style={{
                transition: 'transform 120ms ease',
                height: 'clamp(56px, 9.5vh, 68px)',
              }}
            >
              {key === 'del' ? '⌫' : key}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
