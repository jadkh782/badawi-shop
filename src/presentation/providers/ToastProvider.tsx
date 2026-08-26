'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

type ToastTone = 'info' | 'success' | 'error';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  notify: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_CLASS: Record<ToastTone, string> = {
  info: 'bg-[var(--color-ink-high)] text-[var(--color-paper)] border-[var(--color-line)]',
  success: 'bg-[var(--color-sell)] text-[#1a1206] border-[var(--color-sell)]',
  error: 'bg-[var(--color-danger-dim)] text-[var(--color-danger)] border-[var(--color-danger)]',
};

/** Brief confirmations and errors, above the bottom bar so a thumb never covers them. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    // Errors stay long enough to read twice; confirmations get out of the way.
    setTimeout(() => setToasts((c) => c.filter((t) => t.id !== id)), tone === 'error' ? 5200 : 2600);
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[104px] z-[70] flex flex-col items-center gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`max-w-sm rounded-2xl border px-4 py-3 text-sm font-semibold shadow-xl ${TONE_CLASS[toast.tone]}`}
            style={{ animation: 'rise 180ms ease-out' }}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
