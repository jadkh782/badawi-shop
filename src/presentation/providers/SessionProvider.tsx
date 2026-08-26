'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ShopUser } from '@/application/ports';
import { container } from '@/container';
import { messageFor } from '@/infrastructure/supabase/errors';
import { pinIsSet } from './pin';

interface SessionContextValue {
  user: ShopUser | null;
  ready: boolean;
  error: string | null;
  locked: boolean;
  lock: () => void;
  unlock: () => void;
  retry: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Gets the till a session on launch, and locks the screen behind the PIN.
 *
 * There is no sign-in screen. The app obtains its own session, and the PIN is the only thing
 * a person is ever asked for.
 *
 * The lock starts on, because opening the app after it has been closed is exactly when the
 * PIN is for.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ShopUser | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
    Always starts locked, on the server and on the client alike.

    Reading local storage here instead would disagree with the prerendered HTML and produce a
    hydration mismatch, and the safe direction to be wrong in is locked: starting unlocked
    would flash the day's takings on screen before the lock caught up.
  */
  const [locked, setLocked] = useState(true);
  const [attempt, setAttempt] = useState(0);

  // Only once mounted can local storage be consulted about whether the lock is wanted.
  useEffect(() => {
    if (!pinIsSet()) setLocked(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);

    void (async () => {
      try {
        const session = await container().auth.ensureSession();
        if (!cancelled) setUser(session);
      } catch (e) {
        if (!cancelled) {
          setUser(null);
          setError(messageFor(e));
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      ready,
      error,
      locked,
      lock: () => setLocked(true),
      unlock: () => setLocked(false),
      retry: () => setAttempt((n) => n + 1),
    }),
    [user, ready, error, locked],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}
