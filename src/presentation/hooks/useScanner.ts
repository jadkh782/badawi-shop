'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { IBarcodeScanner } from '@/application/ports';
import { ScannerFactory } from '@/infrastructure/scanning/ScannerFactory';
import { KeyboardWedgeScanner } from '@/infrastructure/scanning/KeyboardWedgeScanner';

export interface ScannerState {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
  error: string | null;
  torchOn: boolean;
  canTorch: boolean;
  toggleTorch: () => Promise<void>;
}

/**
 * Runs the camera for as long as the scanner sheet is open.
 *
 * The handler is held in a ref so that a re-render, which happens on every scan as the cart
 * grows, does not tear the camera down and rebuild it. Restarting the stream per item would
 * make continuous scanning impossible.
 */
export function useScanner(open: boolean, onDetect: (code: string) => void): ScannerState {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<IBarcodeScanner | null>(null);
  const handlerRef = useRef(onDetect);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [canTorch, setCanTorch] = useState(false);

  handlerRef.current = onDetect;

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const scanner = ScannerFactory.create();
    scannerRef.current = scanner;

    void (async () => {
      try {
        const video = videoRef.current;
        if (!video) return;
        await scanner.start(video, (code) => handlerRef.current(code));
        if (cancelled) {
          void scanner.stop();
          return;
        }
        setActive(true);
        setError(null);
        setCanTorch(Boolean(scanner.supportsTorch?.()));
      } catch (e) {
        if (cancelled) return;
        setActive(false);
        setError(describeCameraError(e));
      }
    })();

    return () => {
      cancelled = true;
      setActive(false);
      setTorchOn(false);
      void scanner.stop();
      scannerRef.current = null;
    };
  }, [open]);

  const toggleTorch = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner?.setTorch) return;
    const next = !torchOn;
    await scanner.setTorch(next);
    setTorchOn(next);
  }, [torchOn]);

  return { videoRef, active, error, torchOn, canTorch, toggleTorch };
}

/**
 * Listens for a hardware scanner whenever the till is open.
 *
 * Unlike the camera this runs constantly and costs nothing, so plugging a USB scanner in
 * works without anyone turning anything on.
 */
export function useKeyboardWedge(enabled: boolean, onDetect: (code: string) => void): void {
  const handlerRef = useRef(onDetect);
  handlerRef.current = onDetect;

  useEffect(() => {
    if (!enabled) return;
    const wedge = new KeyboardWedgeScanner();
    void wedge.start(null, (code) => handlerRef.current(code));
    return () => {
      void wedge.stop();
    };
  }, [enabled]);
}

function describeCameraError(error: unknown): string {
  const name = (error as { name?: string })?.name;

  if (name === 'NotAllowedError') {
    return 'The camera was blocked. Allow camera access for this site in your browser settings, then try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera was found on this device. Type the barcode instead.';
  }
  if (name === 'NotReadableError') {
    return 'Another app is using the camera. Close it and try again.';
  }
  if (error instanceof Error && error.message) return error.message;

  return 'The camera could not be opened. Type the barcode instead.';
}
