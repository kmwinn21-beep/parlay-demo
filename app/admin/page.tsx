'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

interface ConfigOption {
  id: number;
  category: string;
  value: string;
  sort_order: number;
}

const CATEGORIES = [
  { key: 'company_type', label: 'Company Types' },
  { key: 'status', label: 'Status Options' },
  { key: 'action', label: 'Actions' },
  { key: 'next_steps', label: 'Next Steps' },
];

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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  // Use a ref to reliably read the input value at submission time,
  // avoiding any stale-closure / React batching edge cases.
  const newInputRef = useRef<HTMLInputElement>(null);

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
      toast.success('Deleted.');
      onRefresh();
    } catch {
      toast.error('Failed to delete.');
    }
  };

  const handleAdd = async () => {
    const rawValue = newInputRef.current?.value ?? '';
    const trimmed = rawValue.trim();
    if (!trimmed) { toast.error('Value cannot be empty.'); return; }
    setIsAdding(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, value: trimmed, sort_order: options.length + 1 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to add');
      }
      toast.success('Added!');
      if (newInputRef.current) newInputRef.current.value = '';
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add.');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-procare-dark-blue font-serif mb-4">{label}</h2>

      {options.length === 0 ? (
        <p className="text-sm text-gray-400 mb-4">No options yet.</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {options.map((opt) => (
            <li key={opt.id} className="flex items-center gap-2">
              {editingId === opt.id ? (
                <>
                  <input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="input-field flex-1 text-sm"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(opt.id); if (e.key === 'Escape') setEditingId(null); }}
                    autoFocus
                  />
                  <button type="button" onClick={() => handleSaveEdit(opt.id)} className="btn-primary text-xs px-3 py-1.5">Save</button>
                  <button type="button" onClick={() => setEditingId(null)} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-gray-800 py-1.5 px-2 rounded hover:bg-gray-50 cursor-pointer" onClick={() => handleEdit(opt)}>
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

      <div className="flex gap-2 pt-3 border-t border-gray-100">
        <input
          ref={newInputRef}
          defaultValue=""
          placeholder={`Add new ${label.toLowerCase().replace(/s$/, '')}...`}
          className="input-field flex-1 text-sm"
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
        <button type="button" onClick={handleAdd} disabled={isAdding} className="btn-primary text-sm">
          {isAdding ? 'Adding...' : 'Add'}
        </button>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [optionsByCategory, setOptionsByCategory] = useState<Record<string, ConfigOption[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = async () => {
    try {
      const results = await Promise.all(
        CATEGORIES.map((cat) =>
          fetch(`/api/config?category=${cat.key}`)
            .then((r) => r.json())
            .then((data) => ({ key: cat.key, options: data }))
        )
      );
      const map: Record<string, ConfigOption[]> = {};
      for (const r of results) map[r.key] = r.options;
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
      <div>
        <h1 className="text-2xl font-bold text-procare-dark-blue font-serif">Admin Panel</h1>
        <p className="text-sm text-gray-500 mt-1">Manage dropdown options for company types, statuses, actions, and next steps.</p>
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
