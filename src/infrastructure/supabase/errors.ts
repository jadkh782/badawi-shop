import { DomainError, InsufficientStockError } from '@/domain';

interface PostgrestLikeError {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

/**
 * Turns a Postgres error into something the till can show a person.
 *
 * BS001 is the code the checkout and stock functions raise when the shelf cannot cover the
 * request. Its message already names the article and the amount, so it is passed through
 * rather than replaced with something vaguer.
 */
/**
 * Spots the case where the database could not be reached at all.
 *
 * The browser reports this as "Failed to fetch", which tells a shopkeeper nothing and is not
 * even obviously an error about the internet. It is by far the most common thing to go wrong
 * on a phone behind a counter, so it gets a message that says what to do about it.
 */
export function isOffline(error: unknown): boolean {
  const message = (error as { message?: string })?.message ?? '';
  const name = (error as { name?: string })?.name ?? '';
  return (
    name === 'AuthRetryableFetchError' ||
    name === 'TypeError' ||
    /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(message)
  );
}

const OFFLINE_MESSAGE =
  'Could not reach the shop database. Check this device is online, then try again.';

export function translateError(error: PostgrestLikeError): Error {
  if (isOffline(error)) return new DomainError(OFFLINE_MESSAGE);

  switch (error.code) {
    case 'BS001':
      return InsufficientStockError.fromMessage(error.message);
    case '22023':
    case '23503':
      return new DomainError(error.message);
    case '42501':
      return new DomainError('Your session has expired. Sign in again to continue.');
    case '23505':
      return new DomainError('That value is already used by another record.');
    case 'PGRST301':
      return new DomainError('Your session has expired. Sign in again to continue.');
    default:
      return new Error(error.message || 'Something went wrong talking to the database');
  }
}

/** The message worth putting in front of the cashier, whatever went wrong. */
export function messageFor(error: unknown): string {
  if (error instanceof DomainError) return error.message;
  if (isOffline(error)) return OFFLINE_MESSAGE;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}
