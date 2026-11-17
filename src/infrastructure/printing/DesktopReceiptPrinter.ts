import type { IReceiptPrinter, PrintJob, PrintOutcome } from '@/application/ports';

/** What the till app puts on the window, and all it puts there. */
interface DesktopBridge {
  print(job: {
    html: string;
    title: string;
    deviceName?: string;
    chooseDestination?: boolean;
  }): Promise<string>;
  listPrinters(): Promise<Array<{ name: string; description: string; isDefault: boolean }>>;
}

function bridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { badawiPrint?: DesktopBridge }).badawiPrint ?? null;
}

/** Which printer this particular till should use. A fact about the counter, not the shop. */
const DEVICE_KEY = 'badawi.printer.device';

export interface KnownPrinter {
  name: string;
  description: string;
  isDefault: boolean;
}

/**
 * Printing from inside the desktop app, with no dialog.
 *
 * Same document as the browser builds — it is handed straight across and rendered by the
 * till app. What changes is only that nobody has to confirm it: at a counter with someone
 * waiting, a dialog per sale is a dialog too many.
 *
 * Which printer is remembered on the machine rather than in the database, because a shop may
 * have a till with a printer and a phone without one, and the right answer differs per
 * device. That is the same reason the screen lock PIN lives in localStorage.
 */
export class DesktopReceiptPrinter implements IReceiptPrinter {
  readonly name = 'Till printer';

  /** True only inside the desktop app, which is what the container branches on. */
  static isAvailable(): boolean {
    return bridge() !== null;
  }

  static async listPrinters(): Promise<KnownPrinter[]> {
    const api = bridge();
    if (!api) return [];
    try {
      return await api.listPrinters();
    } catch {
      return [];
    }
  }

  static chosenPrinter(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(DEVICE_KEY);
    } catch {
      // Private browsing and blocked site data both throw here. Falling back to the system
      // default beats refusing to print.
      return null;
    }
  }

  static choosePrinter(name: string | null): void {
    try {
      if (name) localStorage.setItem(DEVICE_KEY, name);
      else localStorage.removeItem(DEVICE_KEY);
    } catch {
      // Nothing to do; the next print falls back to the system default.
    }
  }

  async print(job: PrintJob): Promise<PrintOutcome> {
    const api = bridge();
    if (!api) return 'unavailable';

    const chosen = DesktopReceiptPrinter.chosenPrinter();
    try {
      const outcome = await api.print({
        html: job.html,
        title: job.title,
        // A sheet goes wherever the shop says; only receipts assume the till printer.
        ...(job.chooseDestination ? {} : chosen ? { deviceName: chosen } : {}),
        ...(job.chooseDestination ? { chooseDestination: true } : {}),
      });
      return outcome === 'printed' || outcome === 'cancelled' ? outcome : 'unavailable';
    } catch {
      return 'unavailable';
    }
  }
}
