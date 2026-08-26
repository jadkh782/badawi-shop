'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ExchangeRate, ShopSettings } from '@/domain';
import { container } from '@/container';

interface SettingsContextValue {
  settings: ShopSettings;
  rate: ExchangeRate;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * Holds the shop settings for the whole session.
 *
 * The exchange rate is read once and shared, rather than fetched per screen: every LBP figure
 * in the app derives from it, and two screens showing two different rates would be worse than
 * showing none at all.
 */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<ShopSettings>(() => ShopSettings.fallback());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setSettings(await container().settings.get());
    } catch {
      // An unreachable settings row is not worth blocking the till for. The fallback rate
      // keeps USD correct and only makes the LBP line stale.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, rate: settings.exchangeRate, loading, refresh }),
    [settings, loading, refresh],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside SettingsProvider');
  return context;
}
