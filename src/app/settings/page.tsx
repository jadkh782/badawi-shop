'use client';

import { useCallback, useEffect, useState } from 'react';
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
import {
  DesktopReceiptPrinter,
  type KnownPrinter,
} from '@/infrastructure/printing/DesktopReceiptPrinter';
import { Sheet } from '@/presentation/components/Sheet';
import { PinPad } from '@/presentation/components/PinPad';
import { ResetSheet } from '@/presentation/components/ResetSheet';

const SAMPLE = Money.fromDollars(1);

/**
 * Always the newest published installer.
 *
 * Pinned to "latest" rather than a version, and the installer is named the same thing in
 * every release, so this address never has to be edited again. The file itself is far too
 * large to live in the repository, which is why it is a release asset rather than something
 * served from the site.
 */
const TILL_APP_DOWNLOAD =
  'https://github.com/jadkh782/badawi-shop/releases/latest/download/BadawiShop-Setup.exe';

export default function SettingsPage() {
  const { settings, rate, refresh } = useSettings();
  const { user, lock } = useSession();
  const { notify } = useToast();

  const [rateInput, setRateInput] = useState('');
  const [rounding, setRounding] = useState('1000');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [footer, setFooter] = useState('');
  // Only ever populated inside the till app; a browser has no way to list printers.
  const [printers, setPrinters] = useState<KnownPrinter[]>([]);
  const [device, setDevice] = useState<string | null>(null);
  const [labelDevice, setLabelDevice] = useState<string | null>(null);
  const [inTillApp, setInTillApp] = useState(false);
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
    setPhone(settings.shopPhone ?? '');
    setAddress(settings.shopAddress ?? '');
    setFooter(settings.receiptFooter ?? '');
  }, [settings]);

  useEffect(() => {
    setLockOn(pinIsSet());
    setCustom(hasCustomPin());
  }, []);

  // Which printers this machine has is a question only the till app can answer, and the
  // answer is remembered on the machine, so it is read the same way the lock flags are.
  /*
    Asked for again on demand, because a printer is often installed while this page is open:
    the shop plugs one in, runs the driver, comes back and wonders why it is not listed. The
    list is read once on mount and otherwise only when asked.
  */
  const refreshPrinters = useCallback(async () => {
    if (!DesktopReceiptPrinter.isAvailable()) return;
    setPrinters(await DesktopReceiptPrinter.listPrinters());
  }, []);

  useEffect(() => {
    // Read after mount, never during render: the static build has no window, and deciding
    // this while rendering would make the server and the browser disagree.
    setInTillApp(DesktopReceiptPrinter.isAvailable());
    if (!DesktopReceiptPrinter.isAvailable()) return;
    setDevice(DesktopReceiptPrinter.chosenPrinter('receipt'));
    setLabelDevice(DesktopReceiptPrinter.chosenPrinter('label'));
    void refreshPrinters();
  }, [refreshPrinters]);

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

  async function saveReceipt() {
    setBusy(true);
    try {
      await container().updateSettings.setReceiptDetails(phone, address, footer);
      await refresh();
      notify('Receipt details updated', 'success');
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

          {/* A second machine with a second roll. Labels sent to the till printer would come
              out down a receipt, so this is a separate choice rather than a shared one. */}
          {printers.length > 0 && (
            <section className="card p-4">
              <p className="eyebrow">Label printer</p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
                Where shelf labels go. A different machine from the receipt printer, with
                50&nbsp;&times;&nbsp;30&nbsp;mm label stock. Set the same size in its Windows
                driver, or the print walks off the label a fraction at a time.
              </p>

              <div className="mt-3 flex flex-col gap-2">
                <PrinterChoice
                  label="Whatever Windows uses"
                  detail="The system default printer"
                  selected={labelDevice === null}
                  onSelect={() => {
                    DesktopReceiptPrinter.choosePrinter(null, 'label');
                    setLabelDevice(null);
                    notify('Labels will use the system default printer');
                  }}
                />
                {printers.map((printer) => (
                  <PrinterChoice
                    key={printer.name}
                    label={printer.name}
                    detail={printer.isDefault ? 'Windows default' : printer.description}
                    selected={labelDevice === printer.name}
                    onSelect={() => {
                      DesktopReceiptPrinter.choosePrinter(printer.name, 'label');
                      setLabelDevice(printer.name);
                      notify(`Labels will print to ${printer.name}`, 'success');
                    }}
                  />
                ))}
              </div>
              <button
                type="button"
                className="btn btn-ghost mt-3 w-full"
                onClick={() => {
                  void refreshPrinters().then(() => notify('Printer list reread'));
                }}
              >
                Look for printers again
              </button>
            </section>
          )}

          {/* Printed, not shown. Everything here exists only on paper, which is why it sits
              apart from the shop name rather than beside it. */}
          <section className="card p-4">
            <p className="eyebrow">On the receipt</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
              Printed under the shop name and at the bottom of every receipt. Leave any of
              them empty and that line is simply left off.
            </p>

            <label className="eyebrow mt-4 block" htmlFor="shop-phone">
              Phone
            </label>
            <input
              id="shop-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              placeholder="01 234 567"
              className="field tnum mt-2"
            />

            <label className="eyebrow mt-4 block" htmlFor="shop-address">
              Address
            </label>
            <input
              id="shop-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Street, town"
              className="field mt-2"
            />

            <label className="eyebrow mt-4 block" htmlFor="receipt-footer">
              Message at the bottom
            </label>
            <textarea
              id="receipt-footer"
              value={footer}
              onChange={(event) => setFooter(event.target.value)}
              rows={3}
              placeholder="Thank you"
              className="field mt-2 resize-none"
              style={{ minHeight: 0 }}
            />

            <button
              type="button"
              className="btn btn-ghost mt-3 w-full"
              disabled={busy}
              onClick={() => void saveReceipt()}
            >
              Save receipt details
            </button>
          </section>

          {/* Absent in a browser, which has no printer to choose and no way to ask. The till
              app is the only place this question has an answer. */}
          {printers.length > 0 && (
            <section className="card p-4">
              <p className="eyebrow">Printer</p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
                Which printer receipts go to. Pick the thermal one by name rather than
                leaving it to Windows, or a receipt eventually comes out as a PDF nobody
                asked for.
              </p>

              <div className="mt-3 flex flex-col gap-2">
                <PrinterChoice
                  label="Whatever Windows uses"
                  detail="The system default printer"
                  selected={device === null}
                  onSelect={() => {
                    DesktopReceiptPrinter.choosePrinter(null, 'receipt');
                    setDevice(null);
                    notify('Using the system default printer');
                  }}
                />
                {printers.map((printer) => (
                  <PrinterChoice
                    key={printer.name}
                    label={printer.name}
                    detail={printer.isDefault ? 'Windows default' : printer.description}
                    selected={device === printer.name}
                    onSelect={() => {
                      DesktopReceiptPrinter.choosePrinter(printer.name, 'receipt');
                      setDevice(printer.name);
                      notify(`Receipts will print to ${printer.name}`, 'success');
                    }}
                  />
                ))}
              </div>

              <button
                type="button"
                className="btn btn-ghost mt-3 w-full"
                onClick={() => {
                  void refreshPrinters().then(() => notify('Printer list reread'));
                }}
              >
                Look for printers again
              </button>
            </section>
          )}

          {/* The download is pointless inside the app it installs, so the till is told it
              already has it instead of being offered it again. */}
          <section className="card p-4">
            <p className="eyebrow">Till app</p>
            {inTillApp ? (
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
                This is the till app. Receipts print straight to the printer without a dialog.
                It loads the live shop, so it updates itself whenever the shop does &mdash;
                there is nothing to reinstall.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
                  For the counter computer. Same shop, same data, but receipts print with no
                  dialog in the way and you can choose which printer they go to. This page
                  works as it always has in a browser; the app only adds the printing.
                </p>

                <a
                  href={TILL_APP_DOWNLOAD}
                  className="btn btn-ghost mt-3 w-full"
                  rel="noreferrer"
                >
                  Download for Windows
                </a>

                <p className="mt-2 text-xs leading-relaxed text-[var(--color-faint)]">
                  About 164&nbsp;MB. Windows will say the publisher is unknown, because the
                  installer is not signed: choose <b>More info</b>, then <b>Run anyway</b>.
                </p>
              </>
            )}
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

/** The same aria-pressed card the cost-method choice uses, so the page reads as one thing. */
function PrinterChoice({
  label,
  detail,
  selected,
  onSelect,
}: {
  label: string;
  detail: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="rounded-2xl border px-4 py-3 text-left"
      style={{
        borderColor: selected ? 'var(--color-stock)' : 'var(--color-line)',
        background: selected ? 'var(--color-stock-dim)' : 'transparent',
      }}
    >
      <span className="block text-sm font-semibold">{label}</span>
      {detail && (
        <span className="mt-1 block text-xs leading-relaxed text-[var(--color-faint)]">
          {detail}
        </span>
      )}
    </button>
  );
}
