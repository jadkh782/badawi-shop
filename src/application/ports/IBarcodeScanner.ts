export type BarcodeHandler = (value: string) => void;

/**
 * A source of scanned codes.
 *
 * Three things implement this: the browser BarcodeDetector where it exists, a WebAssembly
 * decoder everywhere else, and a keyboard listener for the cheap USB and Bluetooth scanners
 * that pretend to be a keyboard. The camera sheet is written once against this contract and
 * does not know or care which one it is holding.
 */
export interface IBarcodeScanner {
  readonly name: string;
  /** Whether this implementation can run in the current browser. */
  isSupported(): boolean;
  /** Begins delivering codes. Resolves once the source is actually live. */
  start(video: HTMLVideoElement, onDetect: BarcodeHandler): Promise<void>;
  stop(): Promise<void>;
  /** Switches the camera light where the device exposes one. */
  setTorch?(on: boolean): Promise<void>;
  supportsTorch?(): boolean;
}
