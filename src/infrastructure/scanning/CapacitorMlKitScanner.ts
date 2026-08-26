import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { BarcodeFormat, BarcodeScanner, LensFacing } from '@capacitor-mlkit/barcode-scanning';
import type { BarcodeHandler, IBarcodeScanner } from '@/application/ports';

/**
 * The scanner used inside the Android app: Google ML Kit, running natively.
 *
 * It is a real step up on the browser decoders for the job this shop actually does. It reads
 * a crumpled label at an angle, in the dim light behind a counter, at a distance the web
 * decoders give up at, and it does it without the phone getting warm.
 *
 * It works by running the camera preview *behind* the WebView, so the page has to get out of
 * the way while it is scanning. That is what `SCANNING_CLASS` does: the app keeps drawing its
 * own overlay on top, so the viewfinder is still the app's, not the plugin's.
 *
 * This is a third implementation of the same contract the two web scanners satisfy, which is
 * why the camera screen needed no changes at all to gain it.
 */
export class CapacitorMlKitScanner implements IBarcodeScanner {
  readonly name = 'mlkit-native';

  /** Puts the page into see-through mode so the native preview shows behind it. */
  static readonly SCANNING_CLASS = 'native-scanning';

  private static readonly FORMATS = [
    BarcodeFormat.Ean13,
    BarcodeFormat.Ean8,
    BarcodeFormat.UpcA,
    BarcodeFormat.UpcE,
    BarcodeFormat.Code128,
    BarcodeFormat.Code39,
    BarcodeFormat.Itf,
    BarcodeFormat.QrCode,
    BarcodeFormat.DataMatrix,
  ];

  private static readonly REPEAT_WINDOW_MS = 1200;

  private listener: PluginListenerHandle | null = null;
  private onHidden: (() => void) | null = null;
  private torchAvailable = false;
  private lastValue = '';
  private lastAt = 0;

  isSupported(): boolean {
    return Capacitor.isNativePlatform();
  }

  async start(_video: HTMLVideoElement | null, onDetect: BarcodeHandler): Promise<void> {
    const permission = await BarcodeScanner.requestPermissions();
    if (permission.camera !== 'granted' && permission.camera !== 'limited') {
      throw new Error(
        'Camera access was turned down. Allow it for Badawi Shop in Android settings, then try again.',
      );
    }

    this.lastValue = '';
    this.lastAt = 0;

    this.listener = await BarcodeScanner.addListener('barcodesScanned', (event) => {
      for (const barcode of event.barcodes) {
        const value = barcode.rawValue?.trim();
        if (!value) continue;

        // The native scanner reports the same label on every frame it can still see it, so
        // holding the phone still would otherwise add the item a dozen times.
        const now = Date.now();
        if (value === this.lastValue && now - this.lastAt < CapacitorMlKitScanner.REPEAT_WINDOW_MS) {
          continue;
        }
        this.lastValue = value;
        this.lastAt = now;
        onDetect(value);
      }
    });

    document.documentElement.classList.add(CapacitorMlKitScanner.SCANNING_CLASS);

    try {
      await BarcodeScanner.startScan({
        formats: CapacitorMlKitScanner.FORMATS,
        lensFacing: LensFacing.Back,
      });
    } catch (error) {
      // The page is see-through at this point. Leaving it that way after a failed start is
      // what turns a recoverable error into an app that looks dead, so it gets torn down
      // before the error is allowed to travel any further.
      await this.stop();
      throw error;
    }

    /*
      If the shop switches apps or the screen locks mid-scan, the camera has to be released.
      Without this the app comes back to a frozen preview over a transparent page, which is
      indistinguishable from a crash and was almost certainly being reported as one.
    */
    this.onHidden = () => {
      if (document.visibilityState === 'hidden') void this.stop();
    };
    document.addEventListener('visibilitychange', this.onHidden);

    this.torchAvailable = await BarcodeScanner.isTorchAvailable()
      .then((result) => result.available)
      .catch(() => false);
  }

  /**
   * Safe to call twice, and safe to call when the scan never started. Every step is allowed
   * to fail on its own without stopping the ones after it, because the one thing that must
   * always happen is the page becoming opaque again.
   */
  async stop(): Promise<void> {
    document.documentElement.classList.remove(CapacitorMlKitScanner.SCANNING_CLASS);

    if (this.onHidden) {
      document.removeEventListener('visibilitychange', this.onHidden);
      this.onHidden = null;
    }

    await this.listener?.remove().catch(() => undefined);
    this.listener = null;

    // Never leave the torch burning on a phone that is about to go in a pocket.
    if (this.torchAvailable) await BarcodeScanner.disableTorch().catch(() => undefined);
    await BarcodeScanner.stopScan().catch(() => undefined);
  }

  supportsTorch(): boolean {
    return this.torchAvailable;
  }

  async setTorch(on: boolean): Promise<void> {
    if (!this.torchAvailable) return;
    if (on) await BarcodeScanner.enableTorch();
    else await BarcodeScanner.disableTorch();
  }
}
