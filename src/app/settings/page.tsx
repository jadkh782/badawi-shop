'use client';

import { useEffect, useState } from 'react';
import { Money } from '@/domain';
import { container } from '@/container';
import { messageFor } from '@/infrastructure/supabase/errors';
import { useSettings } from '@/presentation/providers/SettingsProvider';
import { useSession } from '@/presentation/providers/SessionProvider';
import { useToast } from '@/presentation/providers/ToastProvider';
import {
  DEFAULT_PIN,
  PIN_LENGTH,
  disablePin,
  hasCustomPin,
  pinIsSet,
  resetPin,
  setPin,
} from '@/presentation/providers/pin';
import { AppShell } from '@/presentation/components/AppShell';
import { Sheet } from '@/presentation/components/Sheet';
import { PinPad } from '@/presentation/components/PinPad';

const SAMPLE = Money.fromDollars(1);

export default function SettingsPage() {
  const { settings, rate, refresh } = useSettings();
  const { user, lock } = useSession();
  const { notify } = useToast();

  const [rateInput, setRateInput] = useState('');
  const [rounding, setRounding] = useState('1000');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [lockOn, setLockOn] = useState(false);
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    setRateInput(String(settings.exchangeRate.usdToLbp));
    setRounding(String(settings.exchangeRate.rounding));
    setName(settings.shopName);
  }, [settings]);

  useEffect(() => {
    setLockOn(pinIsSet());
    setCustom(hasCustomPin());
  }, []);

  const preview = (() => {
    const parsed = Number(rateInput.replace(/[,\s]/g, ''));
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    const step = Number(rounding.replace(/[,\s]/g, '')) || 1000;
    return Math.round((parsed * SAMPLE.dollars) / step) * step;
  })();

  async function saveRate() {
    setBusy(true);
    try {
      await container().updateSettings.setExchangeRate(rateInput, rounding);
      await refresh();
      notify('Exchange rate updated', 'success');
    } catch (error) {
      notify(messageFor(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    setBusy(true);
    try {
      await container().updateSettings.setShopName(name);
      await refresh();
      notify('Shop name updated', 'success');
    } catch (error) {
      notify(messageFor(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AppShell title="Settings" back="/">
        <div className="flex flex-col gap-4 px-4 py-5">
          <section className="card p-4">
            <p className="eyebrow">Exchange rate</p>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Prices are kept in dollars. This is what turns them into pounds on every screen.
              Sales already taken keep the rate they were taken at.
            </p>

            <label className="eyebrow mt-4 block" htmlFor="rate">
              Pounds per dollar
            </label>
            <input
              id="rate"
              value={rateInput}
              onChange={(event) => setRateInput(event.target.value)}
              inputMode="numeric"
              className="field tnum mt-2 text-xl font-bold"
            />

            <p className="eyebrow mt-4">Round pound totals to the nearest</p>
            <div className="mt-2 flex gap-2">
              {['1000', '5000', '10000'].map((step) => (
                <button
                  key={step}
                  type="button"
                  className="chip flex-1 justify-center"
                  data-active={rounding === step}
                  onClick={() => setRounding(step)}
                >
                  {Number(step).toLocaleString('en-US')}
                </button>
              ))}
            </div>

            {preview !== null && (
              <p className="tnum mt-4 rounded-xl bg-[var(--color-ink)] px-4 py-3 text-sm font-semibold">
                $1.00 shows as {preview.toLocaleString('en-US')} L.L.
              </p>
            )}

            {settings.rateUpdatedAt && (
              <p className="mt-2 text-xs text-[var(--color-faint)]">
                Last changed {settings.rateUpdatedAt.toLocaleDateString('en-GB')}
              </p>
            )}

            <button
              type="button"
              className="btn btn-sell mt-4 w-full"
              disabled={busy}
              onClick={() => void saveRate()}
            >
              Save rate
            </button>
          </section>

          <section className="card p-4">
            <label className="eyebrow" htmlFor="shop">
              Shop name
            </label>
            <input
              id="shop"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="field mt-2"
            />
            <button
              type="button"
              className="btn btn-ghost mt-3 w-full"
              disabled={busy || name.trim() === ''}
              onClick={() => void saveName()}
            >
              Save name
            </button>
          </section>

          <section className="card p-4">
            <p className="eyebrow">Screen lock</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
              {lockOn
                ? custom
                  ? 'The till asks for your PIN when the app is reopened.'
                  : `The till asks for the PIN it was set up with (${DEFAULT_PIN}) when the app is reopened.`
                : 'The lock is off. The till opens straight onto the shop.'}
            </p>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="btn btn-ghost flex-1"
                onClick={() => setPinOpen(true)}
              >
                {custom ? 'Change PIN' : 'Choose your own'}
              </button>
              {custom && (
                <button
                  type="button"
                  className="btn btn-ghost flex-1"
                  onClick={() => {
                    resetPin();
                    setCustom(false);
                    setLockOn(true);
                    notify(`Back to the PIN it shipped with (${DEFAULT_PIN})`);
                  }}
                >
                  Reset
                </button>
              )}
            </div>

            <div className="mt-2 flex gap-2">
              {lockOn ? (
                <>
                  <button type="button" className="btn btn-ghost flex-1" onClick={lock}>
                    Lock now
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost flex-1"
                    onClick={() => {
                      disablePin();
                      setLockOn(false);
                      notify('Lock turned off');
                    }}
                  >
                    Turn off
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost w-full"
                  onClick={() => {
                    resetPin();
                    setLockOn(true);
                    setCustom(false);
                    notify('Lock turned back on');
                  }}
                >
                  Turn the lock back on
                </button>
              )}
            </div>
          </section>

          <section className="card p-4">
            <p className="eyebrow">Connection</p>
            <p className="mt-1 truncate text-sm font-semibold">{user?.email ?? 'connecting...'}</p>
            <p className="mt-2 text-xs leading-relaxed text-[var(--color-faint)]">
              The till holds its own session. There is nothing to sign in or out of.
            </p>
          </section>

          <p className="pb-6 text-center text-xs text-[var(--color-faint)]">
            Rate {rate.usdToLbp.toLocaleString('en-US')} L.L. per dollar
          </p>
        </div>
      </AppShell>

      <Sheet open={pinOpen} onClose={() => setPinOpen(false)} title="Set a PIN">
        <div className="pb-6">
          <p className="mb-6 text-center text-sm text-[var(--color-muted)]">
            Four digits. You will be asked for it when the app is reopened.
          </p>
          <PinPad
            length={PIN_LENGTH}
            onComplete={(pin) => {
              void setPin(pin).then(() => {
                setCustom(true);
                setLockOn(true);
                setPinOpen(false);
                notify('PIN saved', 'success');
              });
            }}
          />
        </div>
      </Sheet>
    </>
  );
}
