export interface ShopUser {
  id: string;
  email: string;
}

/**
 * Getting the app a session.
 *
 * The shop does not sign in. There is one till, in one shop, and asking the person behind the
 * counter for an email address every morning buys nothing: anyone holding the phone is the
 * shop. So the app obtains its own session on launch and the PIN is what actually guards the
 * screen.
 *
 * A session is still required, because the database refuses to answer without one. Row level
 * security grants the signed-in role everything and the anonymous role nothing at all, so an
 * app that could not do this could not read a single row.
 */
export interface IAuthService {
  /** Returns the current session, obtaining one if there is none. Throws if it cannot. */
  ensureSession(): Promise<ShopUser>;
  currentUser(): Promise<ShopUser | null>;
  signOut(): Promise<void>;
}
