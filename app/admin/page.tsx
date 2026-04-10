'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { BackButton } from '@/components/BackButton';
import { COLOR_PRESETS, getPreset } from '@/lib/colors';
import { invalidateConfigColors } from '@/lib/useConfigColors';
import { invalidateConfigOptions } from '@/lib/useConfigOptions';

interface ConfigOption {
  id: number;
  category: string;
  value: string;
  sort_order: number;
  color: string | null;
}

const CATEGORIES = [
  { key: 'company_type', label: 'Company Types' },
  { key: 'entity_structure', label: 'Entity Structure' },
  { key: 'status', label: 'Status Options' },
  { key: 'action', label: 'Actions' },
  { key: 'next_steps', label: 'Next Steps' },
  { key: 'seniority', label: 'Seniority Levels' },
  { key: 'profit_type', label: 'Profit Types' },
  { key: 'services', label: 'Services' },
  { key: 'icp', label: 'ICP' },
  { key: 'event_type', label: 'Event Type' },
  { key: 'rep_relationship_type', label: 'Rep Relationship Type/Status' },
  { key: 'user', label: 'Users' },
];

function DragHandle() {
  return (
    <svg
      className="w-4 h-4 text-gray-300 flex-shrink-0 cursor-grab active:cursor-grabbing"
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <circle cx="5" cy="4" r="1.2" />
      <circle cx="5" cy="8" r="1.2" />
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="11" cy="4" r="1.2" />
      <circle cx="11" cy="8" r="1.2" />
      <circle cx="11" cy="12" r="1.2" />
    </svg>
  );
}

function ColorPicker({ optionId, currentColor, onColorSaved }: { optionId: number; currentColor: string | null; onColorSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const preset = getPreset(currentColor);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = async (colorKey: string | null) => {
    setOpen(false);
    try {
      const res = await fetch(`/api/config/${optionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color: colorKey }),
      });
      if (!res.ok) throw new Error();
      invalidateConfigColors();
      invalidateConfigOptions();
      onColorSaved();
    } catch {
      toast.error('Failed to update color.');
    }
  };

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-5 h-5 rounded-full border-2 border-gray-200 hover:border-gray-400 transition-colors flex-shrink-0"
        style={{ backgroundColor: preset.swatch }}
        title="Change color"
      />
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-7 z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-2 min-w-[180px]">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1.5 px-1">Pick a color</p>
          <div className="grid grid-cols-4 gap-1.5">
            {COLOR_PRESETS.map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => handleSelect(p.key)}
                className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${currentColor === p.key ? 'border-procare-dark-blue ring-2 ring-procare-bright-blue/30' : 'border-gray-200 hover:border-gray-400'}`}
                style={{ backgroundColor: p.swatch }}
                title={p.label}
              />
            ))}
          </div>
          {currentColor && (
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className="w-full mt-2 text-xs text-gray-400 hover:text-gray-600 py-1"
            >
              Reset to default
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CategorySection({
  category,
  label,
  options,
  onRefresh,
}: {
  category: string;
  label: string;
  options: ConfigOption[];
  onRefresh: () => void;
}) {
  const [localOptions, setLocalOptions] = useState<ConfigOption[]>(options);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Drag state
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Sync local options when parent refreshes
  useEffect(() => {
    setLocalOptions(options);
  }, [options]);

  const handleEdit = (opt: ConfigOption) => {
    setEditingId(opt.id);
    setEditValue(opt.value);
  };

  const handleSaveEdit = async (id: number) => {
    if (!editValue.trim()) { toast.error('Value cannot be empty.'); return; }
    try {
      const res = await fetch(`/api/config/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: editValue.trim() }),
      });
      if (!res.ok) throw new Error('Update failed');
      setLocalOptions(prev => prev.map(opt => opt.id === id ? { ...opt, value: editValue.trim() } : opt));
      toast.success('Updated!');
      setEditingId(null);
      onRefresh();
    } catch {
      toast.error('Failed to update.');
    }
  };

  const handleDelete = async (id: number, value: string) => {
    if (!confirm(`Delete "${value}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/config/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setLocalOptions(prev => prev.filter(opt => opt.id !== id));
      toast.success('Deleted.');
      onRefresh();
    } catch {
      toast.error('Failed to delete.');
    }
  };

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const trimmed = ((new FormData(form).get('newOption') as string) ?? '').trim();
    if (!trimmed) { toast.error('Value cannot be empty.'); return; }
    setIsAdding(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, value: trimmed, sort_order: localOptions.length + 1 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to add');
      }
      const newOption = await res.json();
      const addedOption: ConfigOption = {
        id: Number(newOption.id),
        category: String(newOption.category),
        value: String(newOption.value),
        sort_order: Number(newOption.sort_order ?? 0),
        color: newOption.color ? String(newOption.color) : null,
      };
      setLocalOptions(prev => [...prev, addedOption]);
      toast.success('Added!');
      form.reset();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add.');
    } finally {
      setIsAdding(false);
    }
  };

  // ── Drag and Drop ──────────────────────────────────────────────────────────

  const handleDragStart = (index: number) => {
    dragIndexRef.current = index;
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndexRef.current === null || dragIndexRef.current === index) return;
    setDragOverIndex(index);
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = dragIndexRef.current;
    if (dragIndex === null || dragIndex === dropIndex) {
      dragIndexRef.current = null;
      setDragOverIndex(null);
      setIsDragging(false);
      return;
    }

    // Reorder locally (optimistic)
    const reordered = [...localOptions];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    const withNewOrder = reordered.map((opt, i) => ({ ...opt, sort_order: i + 1 }));
    setLocalOptions(withNewOrder);

    dragIndexRef.current = null;
    setDragOverIndex(null);
    setIsDragging(false);

    // Persist to server
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: withNewOrder.map(o => ({ id: o.id, sort_order: o.sort_order })),
        }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error('Failed to save order.');
      setLocalOptions(options); // revert
    }
  };

  const handleDragEnd = () => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
    setIsDragging(false);
  };

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-procare-dark-blue font-serif mb-4">{label}</h2>

      {localOptions.length === 0 ? (
        <p className="text-sm text-gray-400 mb-4">No options yet.</p>
      ) : (
        <ul className="space-y-1 mb-4">
          {localOptions.map((opt, index) => (
            <li
              key={opt.id}
              draggable={editingId !== opt.id}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={[
                'flex items-center gap-2 rounded-lg transition-all',
                isDragging && dragIndexRef.current === index ? 'opacity-40' : '',
                dragOverIndex === index && dragIndexRef.current !== index
                  ? 'ring-2 ring-procare-bright-blue ring-offset-1'
                  : '',
              ].join(' ')}
            >
              {editingId === opt.id ? (
                <>
                  {/* spacer matching drag handle width */}
                  <span className="w-4 flex-shrink-0" />
                  <input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="input-field flex-1 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit(opt.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    autoFocus
                  />
                  <button type="button" onClick={() => handleSaveEdit(opt.id)} className="btn-primary text-xs px-3 py-1.5">Save</button>
                  <button type="button" onClick={() => setEditingId(null)} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
                </>
              ) : (
                <>
                  <DragHandle />
                  <ColorPicker optionId={opt.id} currentColor={opt.color} onColorSaved={onRefresh} />
                  <span
                    className="flex-1 text-sm text-gray-800 py-1.5 px-2 rounded hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleEdit(opt)}
                  >
                    {opt.value}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleEdit(opt)}
                    className="text-procare-bright-blue hover:text-procare-dark-blue text-xs font-medium px-2 py-1"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(opt.id, opt.value)}
                    className="text-red-400 hover:text-red-600 text-xs font-medium px-2 py-1"
                  >
                    Delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex gap-2 pt-3 border-t border-gray-100">
        <input
          name="newOption"
          placeholder={`Add new ${label.toLowerCase().replace(/s$/, '')}...`}
          className="input-field flex-1 text-sm"
          autoComplete="off"
        />
        <button type="submit" disabled={isAdding} className="btn-primary text-sm">
          {isAdding ? 'Adding...' : 'Add'}
        </button>
      </form>
    </div>
  );
}

export default function AdminPage() {
  const [optionsByCategory, setOptionsByCategory] = useState<Record<string, ConfigOption[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = async () => {
    invalidateConfigColors();
    invalidateConfigOptions();
    try {
      const results = await Promise.all(
        CATEGORIES.map((cat) =>
          fetch(`/api/config?category=${cat.key}`)
            .then((r) => r.json())
            .then((data) => ({ key: cat.key, options: data }))
        )
      );
      const map: Record<string, ConfigOption[]> = {};
      for (const r of results) {
        // Strip legacy "True"/"False" entries from ICP category
        if (r.key === 'icp') {
          map[r.key] = r.options.filter((o: ConfigOption) => o.value !== 'True' && o.value !== 'False');
        } else {
          map[r.key] = r.options;
        }
      }
      setOptionsByCategory(map);
    } catch {
      toast.error('Failed to load config options.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-procare-bright-blue border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <BackButton />
      <div>
        <h1 className="text-2xl font-bold text-procare-dark-blue font-serif">Admin Panel</h1>
        <p className="text-sm text-gray-500 mt-1">Manage dropdown options for company types, statuses, actions, next steps, seniority levels, profit types, services, ICP, event types, and users.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {CATEGORIES.map((cat) => (
          <CategorySection
            key={cat.key}
            category={cat.key}
            label={cat.label}
            options={optionsByCategory[cat.key] || []}
            onRefresh={fetchAll}
          />
        ))}
      </div>
    </div>
  );
}
