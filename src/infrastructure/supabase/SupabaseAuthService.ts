import type { SupabaseClient } from '@supabase/supabase-js';
import { DomainError } from '@/domain';
import type { IAuthService, ShopUser } from '@/application/ports';
import { isOffline } from './errors';

/**
 * Signs the till in without involving anyone.
 *
 * Two ways, tried in order. A named shop account if one has been configured, which keeps the
 * sales attributable to a real user; otherwise an anonymous session, which needs no
 * credentials stored anywhere at all.
 *
 * Either way the session is cached by the client and refreshed in the background, so this
 * costs one request on a cold start and nothing afterwards.
 */
export class SupabaseAuthService implements IAuthService {
  constructor(private readonly db: SupabaseClient) {}

  async ensureSession(): Promise<ShopUser> {
    const existing = await this.currentUser();
    if (existing) return existing;

    const email = process.env.NEXT_PUBLIC_SHOP_EMAIL?.trim();
    const password = process.env.NEXT_PUBLIC_SHOP_PASSWORD;

    if (email && password) {
      const { data, error } = await this.db.auth.signInWithPassword({ email, password });
      if (error) throw this.explain(error, 'account');
      if (data.user) return { id: data.user.id, email: data.user.email ?? email };
    }

    const { data, error } = await this.db.auth.signInAnonymously();
    if (error) throw this.explain(error, 'anonymous');
    if (!data.user) throw new DomainError('The database did not return a session.');

    return { id: data.user.id, email: data.user.email ?? 'till' };
  }

  async currentUser(): Promise<ShopUser | null> {
    const { data } = await this.db.auth.getUser();
    if (!data.user) return null;
    return { id: data.user.id, email: data.user.email ?? 'till' };
  }

  async signOut(): Promise<void> {
    await this.db.auth.signOut();
  }

  /** Every one of these is something the shop can actually go and fix. */
  private explain(error: { message: string; status?: number }, kind: 'account' | 'anonymous'): DomainError {
    if (isOffline(error)) {
      return new DomainError(
        'Could not reach the shop database. Check this device is online, and that the project ' +
          'URL is correct.',
      );
    }

    if (kind === 'anonymous' && /anonymous|disabled|not enabled/i.test(error.message)) {
      return new DomainError(
        'Anonymous sign-ins are switched off for this project. Turn them on under ' +
          'Authentication, Sign In / Providers, Anonymous sign-ins. Then reopen the app.',
      );
    }

    if (/email not confirmed/i.test(error.message)) {
      return new DomainError(
        'The shop account has not been confirmed. In the dashboard under Authentication, ' +
          'Users, open the account and confirm it, or recreate it with Auto Confirm User ticked.',
      );
    }

    if (/invalid login credentials/i.test(error.message)) {
      return new DomainError(
        'The shop email and password in the app do not match any account in the project.',
      );
    }

    return new DomainError(error.message);
  }
}
