/**
 * The PIN that guards the screen.
 *
 * This is the only thing the shop is ever asked for. It is a screen lock, not a wall around
 * the data: anyone holding the phone with the app on it can reach the shop database, because
 * that is what "no login" means. What the PIN stops is the person who picks up an unattended
 * till seeing the day's takings, and that is the job it is actually being asked to do.
 *
 * It is stored as a salted hash rather than in the clear, because a four digit code chosen by
 * a shop is very often also the code on its back door.
 */
const PIN_KEY = 'badawi.pin';
const SALT_KEY = 'badawi.pin.salt';
const DISABLED_KEY = 'badawi.pin.off';

/** The PIN the app ships with, so it works the moment it is installed. */
export const DEFAULT_PIN = (process.env.NEXT_PUBLIC_SHOP_PIN ?? '2307').trim();

export const PIN_LENGTH = DEFAULT_PIN.length || 4;

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hash(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Whether the lock screen should appear at all. */
export function pinIsSet(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(DISABLED_KEY) !== '1';
}

/** Whether the shop has chosen its own PIN, rather than still using the shipped one. */
export function hasCustomPin(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(localStorage.getItem(PIN_KEY));
}

export async function setPin(pin: string): Promise<void> {
  const salt = randomSalt();
  localStorage.setItem(SALT_KEY, salt);
  localStorage.setItem(PIN_KEY, await hash(pin, salt));
  localStorage.removeItem(DISABLED_KEY);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = localStorage.getItem(PIN_KEY);
  const salt = localStorage.getItem(SALT_KEY);

  // Nothing chosen yet, so the shipped PIN is the one that works. Without this a fresh
  // install would have no way in at all.
  if (!stored || !salt) return pin === DEFAULT_PIN;

  return (await hash(pin, salt)) === stored;
}

/** Goes back to the shipped PIN. */
export function resetPin(): void {
  localStorage.removeItem(PIN_KEY);
  localStorage.removeItem(SALT_KEY);
  localStorage.removeItem(DISABLED_KEY);
}

/** Turns the lock screen off entirely, for a till that never leaves the counter. */
export function disablePin(): void {
  localStorage.setItem(DISABLED_KEY, '1');
}
