import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category } from '@/domain';
import type { CategoryDraft, ICategoryRepository } from '@/application/ports';
import { toCategory } from './mappers/toDomain';
import type { CategoryRow } from './types';
import { translateError } from './errors';

export class SupabaseCategoryRepository implements ICategoryRepository {
  constructor(private readonly db: SupabaseClient) {}

  async list(): Promise<Category[]> {
    const { data, error } = await this.db
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .order('name');
    if (error) throw translateError(error);
    return (data as CategoryRow[]).map(toCategory);
  }

  async create(draft: CategoryDraft): Promise<Category> {
    const { data, error } = await this.db
      .from('categories')
      .insert(toRow(draft))
      .select('*')
      .single();
    if (error) throw translateError(error);
    return toCategory(data as CategoryRow);
  }

  async update(id: string, draft: CategoryDraft): Promise<Category> {
    const { data, error } = await this.db
      .from('categories')
      .update(toRow(draft))
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw translateError(error);
    return toCategory(data as CategoryRow);
  }

  async remove(id: string): Promise<void> {
    // Products keep their rows and fall back to Uncategorised, because the foreign key is
    // ON DELETE SET NULL. Deleting a shelf must never delete what was on it.
    const { error } = await this.db.from('categories').update({ is_active: false }).eq('id', id);
    if (error) throw translateError(error);
  }
}

/**
 * One row shape for both writes, so a field added to the form cannot reach create and miss
 * update. An empty size list is stored as null rather than an empty array: null is what
 * "this shelf does not work that way" means everywhere else that reads it.
 */
function toRow(draft: CategoryDraft): Record<string, unknown> {
  const sizes = (draft.variantSizes ?? []).map((s) => s.trim()).filter(Boolean);
  const label = draft.variantTraitLabel?.trim();
  return {
    name: draft.name,
    color: draft.color,
    sort_order: draft.sortOrder,
    variant_sizes: sizes.length > 0 ? sizes : null,
    variant_trait_label: sizes.length > 0 ? (label || 'Variety') : null,
  };
}
