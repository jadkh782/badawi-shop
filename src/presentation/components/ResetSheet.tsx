'use client';

import { useEffect, useState } from 'react';
import { ResetShop } from '@/application/use-cases';
import { container } from '@/container';
import { messageFor } from '@/infrastructure/supabase/errors';
import { useToast } from '@/presentation/providers/ToastProvider';
import { Sheet } from './Sheet';

/**
 * Emptying the shop.
 *
 * Deliberately awkward. It says exactly what will go, in plain words and with the counts, and
 * then asks for the word to be typed out. Nothing here is one tap away, because there is no
 * undo behind it and no backup to restore from.
 */
export function ResetSheet({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { notify } = useToast();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  const armed = typed.trim().toUpperCase() === ResetShop.WORD;

  async function run() {
    setBusy(true);
    try {
      const counts = await container().resetShop.execute(typed);
      // Naming the numbers is the difference between "it worked" and knowing what happened.
      notify(
        `Removed ${counts.sales} sales, ${counts.products} articles and ${counts.categories} categories`,
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
    <Sheet open={open} onClose={onClose} title="Start again from empty">
      <div className="pb-2">
        <p className="rounded-2xl bg-[var(--color-danger-dim)] px-4 py-3 text-sm font-medium leading-relaxed text-[var(--color-danger)]">
          This deletes everything and cannot be undone. There is no backup.
        </p>

        <p className="mt-4 text-sm text-[var(--color-muted)]">What goes:</p>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm">
          {[
            'Every sale and every receipt',
            'The whole stock ledger',
            'The budget and every entry in it',
            'Every article, with its prices and stock',
            'Every category',
          ].map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden className="text-[var(--color-danger)]">
                &minus;
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-sm text-[var(--color-muted)]">What stays:</p>
        <p className="mt-1.5 text-sm">
          The exchange rate and the shop name, so they do not have to be typed back in.
        </p>

        <label className="eyebrow mt-5 block" htmlFor="confirm">
          Type {ResetShop.WORD} to confirm
        </label>
        <input
          id="confirm"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder={ResetShop.WORD}
          className="field mt-1.5"
        />

        <button
          type="button"
          className="btn mb-2 mt-4 w-full"
          style={{
            background: armed ? 'var(--color-danger)' : 'var(--color-ink-raised)',
            color: armed ? '#fff' : 'var(--color-faint)',
          }}
          disabled={!armed || busy}
          onClick={() => void run()}
        >
          {busy ? 'Deleting...' : 'Delete everything'}
        </button>
      </div>
    </Sheet>
  );
}
