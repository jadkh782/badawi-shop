import type { SupabaseClient } from '@supabase/supabase-js';
import { ShopSettings, type CostMethod } from '@/domain';
import type { ISettingsRepository } from '@/application/ports';
import { toSettings } from './mappers/toDomain';
import type { AppSettingsRow } from './types';
import { translateError } from './errors';

export class SupabaseSettingsRepository implements ISettingsRepository {
  constructor(private readonly db: SupabaseClient) {}

  async get(): Promise<ShopSettings> {
    const { data, error } = await this.db.from('app_settings').select('*').eq('id', 1).maybeSingle();
    if (error) throw translateError(error);
    // A missing row means the seed has not run yet. A sensible default beats a crash on the
    // first screen the shop ever opens.
    return data ? toSettings(data as AppSettingsRow) : ShopSettings.fallback();
  }

  async updateExchangeRate(usdToLbp: number, rounding: number): Promise<ShopSettings> {
    const { data, error } = await this.db
      .from('app_settings')
      .update({
        usd_to_lbp_rate: usdToLbp,
        lbp_rounding: rounding,
        rate_updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
      .select('*')
      .single();
    if (error) throw translateError(error);
    return toSettings(data as AppSettingsRow);
  }

  /**
   * Not a column write.
   *
   * Switching to average has to fold every article's open batches into one and restate its
   * cost, which has to happen in the same transaction as the setting itself. Half of that
   * applied is a shop whose till stops asking while its books still hold two prices.
   */
  async updateCostMethod(method: CostMethod): Promise<ShopSettings> {
    const { error } = await this.db.rpc('set_cost_method', { p_method: method });
    if (error) throw translateError(error);
    return this.get();
  }

  async updateShopName(name: string): Promise<ShopSettings> {
    const { data, error } = await this.db
      .from('app_settings')
      .update({ shop_name: name })
      .eq('id', 1)
      .select('*')
      .single();
    if (error) throw translateError(error);
    return toSettings(data as AppSettingsRow);
  }
}
