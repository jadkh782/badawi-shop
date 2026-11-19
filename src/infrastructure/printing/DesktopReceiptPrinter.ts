import type { IReceiptPrinter, PrintJob, PrintOutcome } from '@/application/ports';

/** What the till app puts on the window, and all it puts there. */
interface DesktopBridge {
  print(job: {
    html: string;
    title: string;
    deviceName?: string;
    chooseDestination?: boolean;
    destination?: string;
    pageSizeMm?: { widthMm: number; heightMm: number };
  }): Promise<string>;
  listPrinters(): Promise<Array<{ name: string; description: string; isDefault: boolean }>>;
}

function bridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { badawiPrint?: DesktopBridge }).badawiPrint ?? null;
}

/** Which printer this particular till should use. A fact about the counter, not the shop. */
const DEVICE_KEYS = {
  receipt: 'badawi.printer.device',
  label: 'badawi.printer.label',
} as const;

export type PrinterRole = keyof typeof DEVICE_KEYS;

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

  static chosenPrinter(role: PrinterRole = 'receipt'): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(DEVICE_KEYS[role]);
    } catch {
      // Private browsing and blocked site data both throw here. Falling back to the system
      // default beats refusing to print.
      return null;
    }
  }

  static choosePrinter(name: string | null, role: PrinterRole = 'receipt'): void {
    try {
      if (name) localStorage.setItem(DEVICE_KEYS[role], name);
      else localStorage.removeItem(DEVICE_KEYS[role]);
    } catch {
      // Nothing to do; the next print falls back to the system default.
    }
  }

  async print(job: PrintJob): Promise<PrintOutcome> {
    const api = bridge();
    if (!api) return 'unavailable';

    const destination = job.destination ?? 'receipt';
    // Asking means the shop picks in the dialog, so no printer is named at all.
    const chosen =
      destination === 'ask' ? null : DesktopReceiptPrinter.chosenPrinter(destination);

    try {
      const outcome = await api.print({
        html: job.html,
        title: job.title,
        ...(chosen ? { deviceName: chosen } : {}),
        ...(destination === 'ask' ? { chooseDestination: true } : {}),
        // The paper, where the document is composed around a known one. Without it the till
        // app falls back to the printer's stored page and a label prints blank.
        ...(job.pageSizeMm ? { pageSizeMm: job.pageSizeMm } : {}),
        // Named so the till app knows which of the three documents this is.
        destination,
      });
      return outcome === 'printed' || outcome === 'cancelled' ? outcome : 'unavailable';
    } catch {
      return 'unavailable';
    }
  }
}
