import type { IBarcodeScanner } from '@/application/ports';
import { CapacitorMlKitScanner } from './CapacitorMlKitScanner';
import { NativeBarcodeDetectorScanner } from './NativeBarcodeDetectorScanner';
import { ZXingWasmScanner } from './ZXingWasmScanner';

/**
 * Picks the best camera decoder available where the app is running.
 *
 * The list is the preference order: Google ML Kit inside the Android app, the browser's own
 * decoder where it exists, and WebAssembly everywhere else. Each is tried in turn and the
 * first one that says it can run wins.
 *
 * Adding the native scanner meant adding a class and a line here. Not one screen, use case
 * or entity changed, which is the whole reason scanning sits behind an interface.
 */
export class ScannerFactory {
  private static readonly candidates: Array<() => IBarcodeScanner> = [
    () => new CapacitorMlKitScanner(),
    () => new NativeBarcodeDetectorScanner(),
    () => new ZXingWasmScanner(),
  ];

  static create(): IBarcodeScanner {
    for (const make of ScannerFactory.candidates) {
      const scanner = make();
      if (scanner.isSupported()) return scanner;
    }
    // Every browser that can open a camera can run WebAssembly, so this is the safety net
    // rather than a real branch.
    return new ZXingWasmScanner();
  }
}
