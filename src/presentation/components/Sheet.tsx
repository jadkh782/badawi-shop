'use client';

import { useEffect } from 'react';
import { CloseIcon } from './Icons';

/**
 * A panel that rises from the bottom of the screen on a phone, and sits in the middle of it
 * on a desktop.
 *
 * Bottom-anchored on a phone because that is where a thumb reaches. On a desktop a sheet
 * stuck to the bottom edge of a wide monitor is a long way from where the eye already is, so
 * it becomes an ordinary centred dialog. Escape and the backdrop close it either way, and the
 * page behind stops scrolling while it is open.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end lg:items-center lg:justify-center lg:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="safe-bottom relative max-h-[88dvh] overflow-y-auto rounded-t-[28px] border-t border-[var(--color-line)] bg-[var(--color-ink-raised)] px-4 pt-3 lg:w-full lg:max-w-lg lg:rounded-[24px] lg:border lg:px-6 lg:pb-6 lg:pt-5 lg:shadow-2xl"
        style={{ animation: 'rise 220ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}
      >
        {/* The drag handle is a phone affordance; there is nothing to drag with a mouse. */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--color-line)] lg:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-muted)]"
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
