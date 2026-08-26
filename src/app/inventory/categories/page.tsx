'use client';

import { useEffect, useState } from 'react';
import type { Category } from '@/domain';
import { container } from '@/container';
import { messageFor } from '@/infrastructure/supabase/errors';
import { useToast } from '@/presentation/providers/ToastProvider';
import { AppShell } from '@/presentation/components/AppShell';
import { Sheet } from '@/presentation/components/Sheet';
import { PlusIcon } from '@/presentation/components/Icons';

// A fixed set, so shelves stay distinguishable rather than becoming nine shades of grey.
const COLORS = [
  '#0ea5e9', '#22c55e', '#f59e0b', '#ec4899',
  '#8b5cf6', '#ef4444', '#14b8a6', '#a3a3a3',
];

export default function CategoriesPage() {
  const { notify } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0] as string);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setCategories(await container().categories.list());
    } catch (error) {
      notify(messageFor(error), 'error');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNew() {
    setEditing(null);
    setName('');
    setColor(COLORS[0] as string);
    setCreating(true);
  }

  function openEdit(category: Category) {
    setEditing(category);
    setName(category.name);
    setColor(category.color);
    setCreating(true);
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const draft = { name: trimmed, color, sortOrder: editing?.sortOrder ?? categories.length * 10 };
      if (editing) {
        await container().categories.update(editing.id, draft);
      } else {
        await container().categories.create(draft);
      }
      setCreating(false);
      await load();
    } catch (error) {
      notify(messageFor(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing) return;
    setBusy(true);
    try {
      await container().categories.remove(editing.id);
      notify(`${editing.name} removed`, 'success');
      setCreating(false);
      await load();
    } catch (error) {
      notify(messageFor(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AppShell
        title="Categories"
        mode="stock"
        back="/inventory"
        footer={
          <button type="button" className="btn btn-stock w-full" onClick={openNew}>
            <PlusIcon className="h-5 w-5" />
            New category
          </button>
        }
      >
        <p className="px-4 py-4 text-sm text-[var(--color-muted)]">
          Categories group the shelves in Inventory, and are how items without a barcode get
          added to a sale.
        </p>

        <ul className="divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
          {categories.map((category) => (
            <li key={category.id}>
              <button
                type="button"
                onClick={() => openEdit(category)}
                className="flex w-full items-center gap-3 px-4 py-4 text-left active:bg-[var(--color-ink-raised)]"
              >
                <span
                  className="h-4 w-4 shrink-0 rounded-full"
                  style={{ background: category.color }}
                  aria-hidden
                />
                <span className="flex-1 font-semibold">{category.name}</span>
                <span className="text-[var(--color-faint)]" aria-hidden>
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      </AppShell>

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title={editing ? 'Edit category' : 'New category'}
      >
        <label className="eyebrow" htmlFor="cat-name">
          Name
        </label>
        <input
          id="cat-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Drinks, Bakery, Household"
          autoFocus
          className="field mt-2"
        />

        <p className="eyebrow mt-5">Colour</p>
        <div className="mt-2 flex flex-wrap gap-3">
          {COLORS.map((option) => (
            <button
              key={option}
              type="button"
              aria-label={`Colour ${option}`}
              aria-pressed={color === option}
              onClick={() => setColor(option)}
              className="h-11 w-11 rounded-full border-2"
              style={{
                background: option,
                borderColor: color === option ? 'var(--color-paper)' : 'transparent',
              }}
            />
          ))}
        </div>

        <button
          type="button"
          className="btn btn-stock mt-6 w-full"
          disabled={busy || name.trim() === ''}
          onClick={() => void save()}
        >
          {busy ? 'Saving...' : editing ? 'Save changes' : 'Create category'}
        </button>

        {editing && (
          <>
            <button
              type="button"
              className="btn btn-danger mb-2 mt-3 w-full"
              disabled={busy}
              onClick={() => void remove()}
            >
              Remove category
            </button>
            <p className="mb-2 text-center text-xs text-[var(--color-faint)]">
              Articles on this shelf are kept and become uncategorised.
            </p>
          </>
        )}
      </Sheet>
    </>
  );
}
