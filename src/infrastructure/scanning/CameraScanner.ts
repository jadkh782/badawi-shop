import type { BarcodeHandler, IBarcodeScanner } from '@/application/ports';

/**
 * Shared behaviour for anything that reads codes out of the camera.
 *
 * Opening the stream, driving the frame loop, suppressing repeats and working the torch are
 * identical whichever decoder is underneath, so they live here once. A subclass supplies
 * only `decode`, which is the single thing that actually differs.
 */
export abstract class CameraScanner implements IBarcodeScanner {
  abstract readonly name: string;

  /** The same code read twice inside this window is one scan, not two. */
  private static readonly REPEAT_WINDOW_MS = 1200;
  /** Decoding every frame flattens a phone battery for no extra accuracy. */
  private static readonly DECODE_INTERVAL_MS = 100;

  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private lastValue = '';
  private lastAt = 0;

  abstract isSupported(): boolean;

  /** Returns the code found in the current frame, or null. */
  protected abstract decode(video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<string | null>;

  async start(video: HTMLVideoElement, onDetect: BarcodeHandler): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        'This browser will not open the camera. On a phone the page must be served over ' +
          'https for the camera to be available at all.',
      );
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    this.video = video;
    video.srcObject = this.stream;
    video.setAttribute('playsinline', 'true');
    await video.play();

    this.canvas = document.createElement('canvas');
    this.running = true;
    this.lastValue = '';
    this.lastAt = 0;
    void this.loop(onDetect);
  }

  private async loop(onDetect: BarcodeHandler): Promise<void> {
    if (!this.running || !this.video || !this.canvas) return;

    try {
      if (this.video.readyState >= 2) {
        const value = await this.decode(this.video, this.canvas);
        if (value) this.emit(value, onDetect);
      }
    } catch {
      // A frame that will not decode is the normal case, not an error. Keep looking.
    }

    if (this.running) {
      this.timer = setTimeout(() => void this.loop(onDetect), CameraScanner.DECODE_INTERVAL_MS);
    }
  }

  private emit(value: string, onDetect: BarcodeHandler): void {
    const now = Date.now();
    const isRepeat = value === this.lastValue && now - this.lastAt < CameraScanner.REPEAT_WINDOW_MS;
    if (isRepeat) return;
    this.lastValue = value;
    this.lastAt = now;
    onDetect(value);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;

    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;

    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
    this.canvas = null;
  }

  supportsTorch(): boolean {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return false;
    const caps = track.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
    return Boolean(caps?.torch);
  }

  async setTorch(on: boolean): Promise<void> {
    const track = this.stream?.getVideoTracks()[0];
    if (!track || !this.supportsTorch()) return;
    // torch is not in the standard constraint type, but it is what phones actually expose.
    await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
  }

  /** Draws the current frame at a size the decoders are happy with. */
  protected grabFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): ImageData | null {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;

    // Downscaling keeps the decode cheap on a mid-range phone without losing a barcode that
    // fills a reasonable part of the frame.
    const scale = Math.min(1, 800 / Math.max(width, height));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  }
}
