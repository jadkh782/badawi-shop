import { CameraScanner } from './CameraScanner';
import { NATIVE_FORMATS } from './formats';

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

function detectorClass(): BarcodeDetectorConstructor | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor })
    .BarcodeDetector;
  return candidate ?? null;
}

/**
 * The decoder built into the browser. Where it exists, mostly Android Chrome, it is the one
 * to use: it runs on the platform side, it is noticeably faster than anything shipped as
 * JavaScript, and it costs nothing in bundle size.
 */
export class NativeBarcodeDetectorScanner extends CameraScanner {
  readonly name = 'native';
  private detector: BarcodeDetectorLike | null = null;

  override isSupported(): boolean {
    return detectorClass() !== null;
  }

  protected override async decode(video: HTMLVideoElement): Promise<string | null> {
    if (!this.detector) {
      const Detector = detectorClass();
      if (!Detector) return null;
      this.detector = new Detector({ formats: NATIVE_FORMATS });
    }

    const results = await this.detector.detect(video);
    return results[0]?.rawValue ?? null;
  }
}
