import { prepareZXingModule, readBarcodesFromImageData } from 'zxing-wasm/reader';
import { CameraScanner } from './CameraScanner';
import { RETAIL_FORMATS } from './formats';

let prepared = false;

/**
 * The fallback decoder, compiled to WebAssembly.
 *
 * iOS Safari has no built-in barcode support, and it is the browser a lot of shop phones
 * run, so this is not an edge case worth skimping on. The wasm is served from the app itself
 * rather than a CDN, which keeps scanning working once the app is installed to the home
 * screen and the connection is poor.
 */
export class ZXingWasmScanner extends CameraScanner {
  readonly name = 'zxing-wasm';

  override isSupported(): boolean {
    return typeof WebAssembly !== 'undefined';
  }

  protected override async decode(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
  ): Promise<string | null> {
    if (!prepared) {
      prepareZXingModule({
        overrides: { locateFile: (path: string) => (path.endsWith('.wasm') ? '/zxing_reader.wasm' : path) },
        fireImmediately: false,
      });
      prepared = true;
    }

    const frame = this.grabFrame(video, canvas);
    if (!frame) return null;

    const results = await readBarcodesFromImageData(frame, {
      formats: [...RETAIL_FORMATS],
      tryHarder: true,
      // A barcode held up to a phone is usually roughly upright, and skipping the rotated
      // passes keeps each frame fast enough to feel instant.
      tryRotate: false,
      maxNumberOfSymbols: 1,
    });

    const text = results[0]?.text?.trim();
    return text ? text : null;
  }
}
