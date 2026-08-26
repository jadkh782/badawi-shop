'use client';

import { SettingsProvider } from './SettingsProvider';
import { ToastProvider } from './ToastProvider';
import { SessionProvider } from './SessionProvider';
import { isSupabaseConfigured } from '@/infrastructure/supabase/env';
import { isDemo } from '@/container';
import { SetupNotice } from '@/presentation/components/SetupNotice';
import { LockGate } from '@/presentation/components/LockGate';

export function AppProviders({ children }: { children: React.ReactNode }) {
  if (!isDemo && !isSupabaseConfigured()) return <SetupNotice />;

  return (
    <ToastProvider>
      <SessionProvider>
        <SettingsProvider>
          {/*
            Marked so that native scanning can hide the whole app in one rule. The camera
            preview is drawn behind the WebView, so anything the app paints on top of it -
            a page background, a card, the header - hides the camera.
          */}
          <div data-app-root>
            <LockGate>{children}</LockGate>
          </div>
        </SettingsProvider>
      </SessionProvider>
    </ToastProvider>
  );
}
