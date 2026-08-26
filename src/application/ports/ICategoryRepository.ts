import type { Category } from '@/domain';

export interface CategoryDraft {
  name: string;
  color: string;
  sortOrder: number;
}

export interface ICategoryRepository {
  list(): Promise<Category[]>;
  create(draft: CategoryDraft): Promise<Category>;
  update(id: string, draft: CategoryDraft): Promise<Category>;
  remove(id: string): Promise<void>;
}
