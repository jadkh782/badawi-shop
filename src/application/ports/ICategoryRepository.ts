import type { Category } from '@/domain';

export interface CategoryDraft {
  name: string;
  color: string;
  sortOrder: number;
  /** Sizes offered on this shelf. Empty leaves the shelf working the ordinary way. */
  variantSizes?: readonly string[];
  variantTraitLabel?: string | null;
  variantBaseLabel?: string | null;
}

export interface ICategoryRepository {
  list(): Promise<Category[]>;
  create(draft: CategoryDraft): Promise<Category>;
  update(id: string, draft: CategoryDraft): Promise<Category>;
  remove(id: string): Promise<void>;
}
