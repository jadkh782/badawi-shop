import type { BarcodeHandler, IBarcodeScanner } from '@/application/ports';

/**
 * Support for the cheap USB and Bluetooth scanners that present themselves as a keyboard.
 *
 * They type the code far faster than a person can and finish with Enter, which is exactly
 * how they are told apart from someone typing into a search box. Nothing in the app has to
 * know a hardware scanner exists: it satisfies the same contract as the camera, so the shop
 * can plug one in later and it simply works.
 */
export class KeyboardWedgeScanner implements IBarcodeScanner {
  readonly name = 'keyboard-wedge';

  /** Gaps longer than this mean a person is typing, not a scanner firing. */
  private static readonly MAX_GAP_MS = 60;
  private static readonly MIN_LENGTH = 4;

  private buffer = '';
  private lastKeyAt = 0;
  private handler: BarcodeHandler | null = null;
  private listener: ((event: KeyboardEvent) => void) | null = null;

  isSupported(): boolean {
    return typeof window !== 'undefined';
  }

  async start(_video: HTMLVideoElement | null, onDetect: BarcodeHandler): Promise<void> {
    this.handler = onDetect;
    this.listener = (event) => this.onKey(event);
    window.addEventListener('keydown', this.listener);
  }

  private onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    // Never steal keystrokes the cashier is aiming at a field.
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

    const now = Date.now();
    if (now - this.lastKeyAt > KeyboardWedgeScanner.MAX_GAP_MS) this.buffer = '';
    this.lastKeyAt = now;

    if (event.key === 'Enter') {
      const value = this.buffer.trim();
      this.buffer = '';
      if (value.length >= KeyboardWedgeScanner.MIN_LENGTH) {
        event.preventDefault();
        this.handler?.(value);
      }
      return;
    }

    if (event.key.length === 1) this.buffer += event.key;
  }

  async stop(): Promise<void> {
    if (this.listener) window.removeEventListener('keydown', this.listener);
    this.listener = null;
    this.handler = null;
    this.buffer = '';
  }
}
