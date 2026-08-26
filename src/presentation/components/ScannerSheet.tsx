'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useScanner } from '@/presentation/hooks/useScanner';
import { CloseIcon, TorchIcon } from './Icons';

/**
 * The camera, full bleed.
 *
 * Corner brackets rather than a boxed viewfinder, because the frame is the whole screen and
 * a border would just shrink the target. The sweep line is the only thing moving, and it
 * stops entirely when the device asks for reduced motion.
 *
 * `flash` is set by the caller after a successful read: the screen pulses the mode colour so
 * the scan is confirmed even when the phone is at arm length, pointing at a shelf.
 *
 * It renders through a portal onto the body rather than where it is written. The native
 * scanner draws its camera preview *behind* the whole WebView, which means every layer of the
 * app above it has to get out of the way; being outside the app tree is what lets the app be
 * hidden wholesale while this stays visible.
 */
export function ScannerSheet({
  open,
  onClose,
  onDetect,
  title,
  hint,
  flash,
}: {
  open: boolean;
  onClose: () => void;
  onDetect: (code: string) => void;
  title: string;
  hint?: React.ReactNode;
  flash?: number;
}) {
  const { videoRef, active, error, torchOn, canTorch, toggleTorch } = useScanner(open, onDetect);
  const [manual, setManual] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) return;
    setManual('');
    /*
      A last line of defence. The native scanner makes the page see-through so the camera
      shows behind it, and puts it back when it stops. If it ever fails to, the app is left
      looking broken with nothing on screen to explain why, so the closed scanner asserts the
      page is opaque regardless of how it got here.
    */
    document.documentElement.classList.remove('native-scanning');
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black" data-scanner-backdrop>
      {/*
        The web decoders draw the camera into this element. The native one puts its preview
        behind the whole WebView instead, so on Android the element is hidden and the page
        goes transparent around it; the overlay below is the same either way.
      */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover [html.native-scanning_&]:hidden"
        muted
        playsInline
        autoPlay
      />

      {flash ? (
        <div
          key={flash}
          className="pointer-events-none absolute inset-0 bg-[var(--color-sell)]"
          style={{ animation: 'flash 340ms ease-out forwards' }}
        />
      ) : null}

      <div className="pointer-events-none absolute inset-0">
        <Brackets />
        {active && !error && (
          <div
            className="absolute inset-x-10 top-1/2 h-[2px] bg-[var(--color-sell)]"
            style={{ animation: 'sweep 2.1s ease-in-out infinite', boxShadow: '0 0 14px var(--color-sell)' }}
          />
        )}
      </div>

      <div className="safe-top absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/85 to-transparent px-4 py-4">
        <h2 className="flex-1 font-[family-name:var(--font-display)] text-lg font-bold text-white">
          {title}
        </h2>
        {canTorch && (
          <button
            type="button"
            onClick={() => void toggleTorch()}
            aria-label={torchOn ? 'Turn the light off' : 'Turn the light on'}
            aria-pressed={torchOn}
            className={`flex h-11 w-11 items-center justify-center rounded-full ${
              torchOn ? 'bg-[var(--color-sell)] text-black' : 'bg-white/15 text-white'
            }`}
          >
            <TorchIcon />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the scanner"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="safe-bottom absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent px-4 pt-10">
        {hint}

        {error ? (
          <p className="mb-3 rounded-2xl bg-[var(--color-danger-dim)] px-4 py-3 text-sm font-medium text-[var(--color-danger)]">
            {error}
          </p>
        ) : (
          <p className="mb-3 text-center text-sm text-white/70">
            {active ? 'Point the camera at the barcode' : 'Starting the camera...'}
          </p>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            const value = manual.trim();
            if (!value) return;
            setManual('');
            onDetect(value);
          }}
          className="flex gap-2"
        >
          <input
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            placeholder="Or type the barcode"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Barcode"
            className="field flex-1 border-white/20 bg-black/60 text-white placeholder:text-white/40"
          />
          <button type="submit" className="btn btn-sell px-6" disabled={manual.trim() === ''}>
            Add
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function Brackets() {
  const corner = 'absolute h-12 w-12 border-white/70';
  return (
    <div className="absolute inset-x-8 top-1/2 aspect-[4/3] -translate-y-1/2">
      <span className={`${corner} left-0 top-0 rounded-tl-xl border-l-[3px] border-t-[3px]`} />
      <span className={`${corner} right-0 top-0 rounded-tr-xl border-r-[3px] border-t-[3px]`} />
      <span className={`${corner} bottom-0 left-0 rounded-bl-xl border-b-[3px] border-l-[3px]`} />
      <span className={`${corner} bottom-0 right-0 rounded-br-xl border-b-[3px] border-r-[3px]`} />
    </div>
  );
}
