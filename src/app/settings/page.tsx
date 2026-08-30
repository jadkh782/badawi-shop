'use client';

import { useEffect, useState } from 'react';
import { Money, type CostMethod } from '@/domain';
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
import { ResetSheet } from '@/presentation/components/ResetSheet';

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
  const [resetOpen, setResetOpen] = useState(false);
  const [lockOn, setLockOn] = useState(false);
  const [custom, setCustom] = useState(false);
  const [switching, setSwitching] = useState(false);

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

  async function chooseCostMethod(method: CostMethod) {
    if (method === settings.costMethod) return;
    setSwitching(true);
    try {
      await container().updateSettings.setCostMethod(method);
      await refresh();
      notify(
        method === 'average'
          ? 'Now averaging cost across the stock on hand'
          : 'Now keeping each delivery price apart',
        'success',
      );
    } catch (error) {
      notify(messageFor(error), 'error');
    } finally {
      setSwitching(false);
    }
  }

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

          {/* Where the shop decides what "what did this cost" means. Both answers are
              honest; which one is right depends on how the shop actually thinks about its
              stock, which is not something the app can work out on its behalf. */}
          <section className="card p-4">
            <p className="eyebrow">How cost is counted</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
              A supplier&rsquo;s price moves. Buy ten at $15, then ten more at $20, and the
              shelf holds twenty units that did not cost the same as each other.
            </p>

            <div className="mt-3 flex flex-col gap-2">
              <CostChoice
                selected={settings.costMethod === 'average'}
                disabled={switching}
                onSelect={() => void chooseCostMethod('average')}
                label="Average them out"
                detail="Both deliveries become $17.50 each. One price per article, and selling never asks anything."
              />
              <CostChoice
                selected={settings.costMethod === 'batch'}
                disabled={switching}
                onSelect={() => void chooseCostMethod('batch')}
                label="Keep each price apart"
                detail="The $15 ten and the $20 ten stay separate. Selling asks which is going over the counter, and stops asking once the older stock runs out."
              />
            </div>

            {settings.costMethod === 'batch' && (
              <p className="mt-3 rounded-xl bg-[var(--color-ink)] px-3 py-2 text-xs leading-relaxed text-[var(--color-faint)]">
                Switching back to averaging folds every article&rsquo;s remaining stock into a
                single price. Nothing is lost, but the till stops asking.
              </p>
            )}
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
            <p className="eyebrow" style={{ color: 'var(--color-danger)' }}>
              Start again
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
              Empties the shop completely: every sale, the budget, every article and every
              category. Use it once, when you are done testing and ready to trade for real.
            </p>
            <button
              type="button"
              className="btn btn-ghost mt-3 w-full"
              style={{ color: 'var(--color-danger)' }}
              onClick={() => setResetOpen(true)}
            >
              Reset everything
            </button>
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

      <ResetSheet
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onDone={() => {
          setResetOpen(false);
          // Everything on screen is now stale, and a fresh load is the honest way to show it.
          window.location.href = '/';
        }}
      />
    </>
  );
}

function CostChoice({
  selected,
  disabled,
  onSelect,
  label,
  detail,
}: {
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  label: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className="rounded-2xl border px-4 py-3 text-left disabled:opacity-60"
      style={{
        borderColor: selected ? 'var(--color-stock)' : 'var(--color-line)',
        background: selected ? 'var(--color-stock-dim)' : 'transparent',
      }}
    >
      <span className="block text-sm font-semibold">{label}</span>
      <span className="mt-1 block text-xs leading-relaxed text-[var(--color-faint)]">
        {detail}
      </span>
    </button>
  );
}
