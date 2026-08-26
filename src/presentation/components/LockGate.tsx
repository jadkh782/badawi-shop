'use client';

import { useCallback, useState } from 'react';
import { useSession } from '@/presentation/providers/SessionProvider';
import { PIN_LENGTH, verifyPin } from '@/presentation/providers/pin';
import { PinPad } from './PinPad';

/**
 * Stands in front of the app until the PIN is entered.
 *
 * Nothing behind it renders, so a locked phone shows no takings and no stock even for the
 * instant before a redirect would fire. It also waits for the session, so the first screen
 * after unlocking has its data rather than a row of dashes.
 */
export function LockGate({ children }: { children: React.ReactNode }) {
  const { locked, unlock, ready, error, retry } = useSession();
  const [wrong, setWrong] = useState<string | null>(null);

  const submit = useCallback(
    async (pin: string) => {
      if (await verifyPin(pin)) {
        setWrong(null);
        unlock();
      } else {
        setWrong('That PIN does not match. Try again.');
      }
    },
    [unlock],
  );

  if (error) return <CannotConnect message={error} onRetry={retry} />;
  if (!locked) return <>{children}</>;

  return (
    /*
      A short phone with the keyboard bar showing has very little height to work with, so the
      screen scrolls rather than crushing the keypad, and the gaps shrink before anything
      else does. dvh rather than vh so the browser chrome is accounted for.
    */
    <main className="flex min-h-dvh flex-col items-center justify-center overflow-y-auto px-6 py-8 [padding-bottom:calc(env(safe-area-inset-bottom,0px)+2rem)] [padding-top:calc(env(safe-area-inset-top,0px)+2rem)]">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 sm:gap-8">
        <header className="text-center">
          <p className="eyebrow">Badawi Shop</p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold">
            Enter your PIN
          </h1>
        </header>

        <PinPad length={PIN_LENGTH} onComplete={(pin) => void submit(pin)} error={wrong} />

        {!ready && (
          <p className="text-xs text-[var(--color-faint)]">Connecting to the shop database...</p>
        )}
      </div>
    </main>
  );
}

/** The session could not be obtained. Says what to do, rather than sitting there blank. */
function CannotConnect({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div>
        <p className="eyebrow">Cannot start</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold">
          The shop database did not answer
        </h1>
      </div>

      <p className="rounded-2xl bg-[var(--color-danger-dim)] px-4 py-3 text-sm font-medium leading-relaxed text-[var(--color-danger)]">
        {message}
      </p>

      <button type="button" className="btn btn-sell w-full" onClick={onRetry}>
        Try again
      </button>
    </main>
  );
}
