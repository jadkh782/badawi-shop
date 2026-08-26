/**
 * The confirmation that a scan landed.
 *
 * A shop is noisy and the cashier is looking at the item, not the screen, so the scan has to
 * announce itself without being watched. The beep is synthesised rather than loaded as a
 * file: it is two oscillator ramps, it costs nothing to ship, and it never fails to load at
 * the moment it is needed.
 */
let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  // Browsers suspend audio until a gesture; opening the scanner is that gesture.
  if (context.state === 'suspended') void context.resume();
  return context;
}

function tone(frequency: number, startAt: number, duration: number, gain: number): void {
  const ctx = audio();
  if (!ctx) return;

  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();

  oscillator.type = 'square';
  oscillator.frequency.value = frequency;

  // A hard start and stop clicks; a short ramp is what makes it read as a scanner beep.
  envelope.gain.setValueAtTime(0, ctx.currentTime + startAt);
  envelope.gain.linearRampToValueAtTime(gain, ctx.currentTime + startAt + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startAt + duration);

  oscillator.connect(envelope).connect(ctx.destination);
  oscillator.start(ctx.currentTime + startAt);
  oscillator.stop(ctx.currentTime + startAt + duration + 0.02);
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

/** An item went into the cart. One clean rising note. */
export function beepFound(): void {
  tone(1320, 0, 0.07, 0.14);
  vibrate(35);
}

/** The code scanned fine but the shop has never seen it. Two flat notes, lower. */
export function beepUnknown(): void {
  tone(560, 0, 0.09, 0.12);
  tone(440, 0.11, 0.13, 0.12);
  vibrate([30, 60, 30]);
}

/** Something was refused. A short buzz, no tone. */
export function buzzError(): void {
  tone(180, 0, 0.18, 0.1);
  vibrate([60, 40, 60]);
}

/** Prepares the audio context while the user is already tapping something. */
export function primeAudio(): void {
  audio();
}
