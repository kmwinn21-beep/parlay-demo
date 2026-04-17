'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { BackButton } from '@/components/BackButton';
import { COLOR_PRESETS, getPreset } from '@/lib/colors';
import { invalidateConfigColors } from '@/lib/useConfigColors';
import { invalidateConfigOptions } from '@/lib/useConfigOptions';
import { TABLE_COLUMN_DEFS, invalidateTableColumnConfig } from '@/lib/useTableColumnConfig';
import { SECTION_DEFS, invalidateSectionConfig } from '@/lib/useSectionConfig';
import { BRAND_COLOR_DEFAULTS, BRAND_COLOR_META, BRAND_CSS_VARS, hexToRgbChannels, type BrandColorKey } from '@/lib/brand';
import { invalidateAppName } from '@/lib/useAppName';

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

const TABLE_LABELS: Record<string, string> = {
  attendees:    'Attendees Table',
  companies:    'Companies Table',
  follow_ups:   'Follow Ups Table',
  meetings:     'Meetings Table',
  social_events: 'Social Events Table',
};

type Tab = 'types' | 'tables' | 'sections' | 'brand' | 'permissions';

const SECTION_PAGE_LABELS: Record<string, string> = {
  attendee: 'Attendee Page',
  company: 'Company Page',
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function DragHandle() {
  return (
    <svg className="w-4 h-4 text-gray-300 flex-shrink-0 cursor-grab active:cursor-grabbing" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5" cy="4" r="1.2" /><circle cx="5" cy="8" r="1.2" /><circle cx="5" cy="12" r="1.2" />
      <circle cx="11" cy="4" r="1.2" /><circle cx="11" cy="8" r="1.2" /><circle cx="11" cy="12" r="1.2" />
    </svg>
  );
}

function ColorPicker({ optionId, currentColor, onColorSaved }: { optionId: number; currentColor: string | null; onColorSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const preset = getPreset(currentColor);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = async (colorKey: string | null) => {
    setOpen(false);
    try {
      const res = await fetch(`/api/config/${optionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ color: colorKey }) });
      if (!res.ok) throw new Error();
      invalidateConfigColors();
      invalidateConfigOptions();
      onColorSaved();
    } catch { toast.error('Failed to update color.'); }
  };

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button type="button" onClick={() => setOpen(!open)} className="w-5 h-5 rounded-full border-2 border-gray-200 hover:border-gray-400 transition-colors flex-shrink-0" style={{ backgroundColor: preset.swatch }} title="Change color" />
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-7 z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-2 min-w-[180px]">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1.5 px-1">Pick a color</p>
          <div className="grid grid-cols-4 gap-1.5">
            {COLOR_PRESETS.map(p => (
              <button key={p.key} type="button" onClick={() => handleSelect(p.key)} className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${currentColor === p.key ? 'border-procare-dark-blue ring-2 ring-procare-bright-blue/30' : 'border-gray-200 hover:border-gray-400'}`} style={{ backgroundColor: p.swatch }} title={p.label} />
            ))}
          </div>
          {currentColor && <button type="button" onClick={() => handleSelect(null)} className="w-full mt-2 text-xs text-gray-400 hover:text-gray-600 py-1">Reset to default</button>}
        </div>
      )}
    </div>
  );
}

function CategorySection({ category, label, options, onRefresh }: { category: string; label: string; options: ConfigOption[]; onRefresh: () => void }) {
  const [localOptions, setLocalOptions] = useState<ConfigOption[]>(options);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => { setLocalOptions(options); }, [options]);

  const handleEdit = (opt: ConfigOption) => { setEditingId(opt.id); setEditValue(opt.value); };

  const handleSaveEdit = async (id: number) => {
    if (!editValue.trim()) { toast.error('Value cannot be empty.'); return; }
    try {
      const res = await fetch(`/api/config/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: editValue.trim() }) });
      if (!res.ok) throw new Error('Update failed');
      setLocalOptions(prev => prev.map(opt => opt.id === id ? { ...opt, value: editValue.trim() } : opt));
      toast.success('Updated!');
      setEditingId(null);
      onRefresh();
    } catch { toast.error('Failed to update.'); }
  };

  const handleDelete = async (id: number, value: string) => {
    if (!confirm(`Delete "${value}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/config/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setLocalOptions(prev => prev.filter(opt => opt.id !== id));
      toast.success('Deleted.');
      onRefresh();
    } catch { toast.error('Failed to delete.'); }
  };

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const trimmed = ((new FormData(form).get('newOption') as string) ?? '').trim();
    if (!trimmed) { toast.error('Value cannot be empty.'); return; }
    setIsAdding(true);
    try {
      const res = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, value: trimmed, sort_order: localOptions.length + 1 }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed to add'); }
      const newOption = await res.json();
      setLocalOptions(prev => [...prev, { id: Number(newOption.id), category: String(newOption.category), value: String(newOption.value), sort_order: Number(newOption.sort_order ?? 0), color: newOption.color ? String(newOption.color) : null }]);
      toast.success('Added!');
      form.reset();
      onRefresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to add.'); }
    finally { setIsAdding(false); }
  };

  const handleDragStart = (index: number) => { dragIndexRef.current = index; setIsDragging(true); };
  const handleDragOver = (e: React.DragEvent, index: number) => { e.preventDefault(); if (dragIndexRef.current === null || dragIndexRef.current === index) return; setDragOverIndex(index); };
  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = dragIndexRef.current;
    if (dragIndex === null || dragIndex === dropIndex) { dragIndexRef.current = null; setDragOverIndex(null); setIsDragging(false); return; }
    const reordered = [...localOptions];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    const withNewOrder = reordered.map((opt, i) => ({ ...opt, sort_order: i + 1 }));
    setLocalOptions(withNewOrder);
    dragIndexRef.current = null; setDragOverIndex(null); setIsDragging(false);
    try {
      const res = await fetch('/api/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: withNewOrder.map(o => ({ id: o.id, sort_order: o.sort_order })) }) });
      if (!res.ok) throw new Error();
    } catch { toast.error('Failed to save order.'); setLocalOptions(options); }
  };
  const handleDragEnd = () => { dragIndexRef.current = null; setDragOverIndex(null); setIsDragging(false); };

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-procare-dark-blue font-serif mb-4">{label}</h2>
      {localOptions.length === 0 ? <p className="text-sm text-gray-400 mb-4">No options yet.</p> : (
        <ul className="space-y-1 mb-4">
          {localOptions.map((opt, index) => (
            <li key={opt.id} draggable={editingId !== opt.id} onDragStart={() => handleDragStart(index)} onDragOver={(e) => handleDragOver(e, index)} onDrop={(e) => handleDrop(e, index)} onDragEnd={handleDragEnd} className={['flex items-center gap-2 rounded-lg transition-all', isDragging && dragIndexRef.current === index ? 'opacity-40' : '', dragOverIndex === index && dragIndexRef.current !== index ? 'ring-2 ring-procare-bright-blue ring-offset-1' : ''].join(' ')}>
              {editingId === opt.id ? (
                <><span className="w-4 flex-shrink-0" /><input value={editValue} onChange={(e) => setEditValue(e.target.value)} className="input-field flex-1 text-sm" onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(opt.id); if (e.key === 'Escape') setEditingId(null); }} autoFocus /><button type="button" onClick={() => handleSaveEdit(opt.id)} className="btn-primary text-xs px-3 py-1.5">Save</button><button type="button" onClick={() => setEditingId(null)} className="btn-secondary text-xs px-3 py-1.5">Cancel</button></>
              ) : (
                <><DragHandle /><ColorPicker optionId={opt.id} currentColor={opt.color} onColorSaved={onRefresh} /><span className="flex-1 text-sm text-gray-800 py-1.5 px-2 rounded hover:bg-gray-50 cursor-pointer" onClick={() => handleEdit(opt)}>{opt.value}</span><button type="button" onClick={() => handleEdit(opt)} className="text-procare-bright-blue hover:text-procare-dark-blue text-xs font-medium px-2 py-1">Edit</button><button type="button" onClick={() => handleDelete(opt.id, opt.value)} className="text-red-400 hover:text-red-600 text-xs font-medium px-2 py-1">Delete</button></>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleAdd} className="flex gap-2 pt-3 border-t border-gray-100">
        <input name="newOption" placeholder={`Add new ${label.toLowerCase().replace(/s$/, '')}...`} className="input-field flex-1 text-sm" autoComplete="off" />
        <button type="submit" disabled={isAdding} className="btn-primary text-sm">{isAdding ? 'Adding...' : 'Add'}</button>
      </form>
    </div>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${checked ? 'bg-procare-bright-blue' : 'bg-gray-200'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('types');

  // Types tab
  const [optionsByCategory, setOptionsByCategory] = useState<Record<string, ConfigOption[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Edit Tables tab
  const [tableConfig, setTableConfig] = useState<Record<string, Record<string, boolean>>>({});
  const [loadingTables, setLoadingTables] = useState(false);
  const [savingCol, setSavingCol] = useState<string | null>(null);

  // Sections tab
  type LocalSection = { key: string; label: string; sort_order: number; visible: boolean };
  const [sectionConfig, setSectionConfig] = useState<Record<string, LocalSection[]>>({});
  const [loadingSections, setLoadingSections] = useState(false);
  const [savingSections, setSavingSections] = useState<string | null>(null);
  const [editingSectionLabel, setEditingSectionLabel] = useState<{ page: string; key: string } | null>(null);
  const [editLabelValue, setEditLabelValue] = useState('');

  // Brand tab
  const [brandColors, setBrandColors] = useState<Record<BrandColorKey, string>>({ ...BRAND_COLOR_DEFAULTS });
  const [brandDraft, setBrandDraft] = useState<Record<BrandColorKey, string>>({ ...BRAND_COLOR_DEFAULTS });
  const [loadingBrand, setLoadingBrand] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);
  const [savedAppName, setSavedAppName] = useState('');
  const [appNameInput, setAppNameInput] = useState('');
  const [savingAppName, setSavingAppName] = useState(false);

  // Permissions tab
  const [allowUpload, setAllowUpload] = useState(true);
  const [allowedDomain, setAllowedDomain] = useState('');
  const [domainInput, setDomainInput] = useState('');
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [savingPerms, setSavingPerms] = useState(false);
  const [savingDomain, setSavingDomain] = useState(false);

  // ── Types tab ────────────────────────────────────────────────────────────────

  const fetchAll = async () => {
    invalidateConfigColors();
    invalidateConfigOptions();
    try {
      const results = await Promise.all(
        CATEGORIES.map(cat =>
          fetch(`/api/config?category=${cat.key}`, { cache: 'no-store' })
            .then(r => r.json())
            .then(data => ({ key: cat.key, options: data }))
        )
      );
      const map: Record<string, ConfigOption[]> = {};
      for (const r of results) {
        map[r.key] = r.key === 'icp'
          ? r.options.filter((o: ConfigOption) => o.value !== 'True' && o.value !== 'False')
          : r.options;
      }
      setOptionsByCategory(map);
    } catch { toast.error('Failed to load config options.'); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  // ── Edit Tables tab ──────────────────────────────────────────────────────────

  const fetchTableConfig = async () => {
    setLoadingTables(true);
    try {
      const res = await fetch('/api/admin/table-config');
      if (!res.ok) throw new Error();
      const data = await res.json() as Record<string, Record<string, boolean>>;
      setTableConfig(data);
    } catch { toast.error('Failed to load table config.'); }
    finally { setLoadingTables(false); }
  };

  useEffect(() => {
    if (tab === 'tables') fetchTableConfig();
  }, [tab]);

  // ── Sections tab ─────────────────────────────────────────────────────────────

  const fetchSectionConfig = async () => {
    setLoadingSections(true);
    try {
      const res = await fetch('/api/admin/section-config');
      if (!res.ok) throw new Error();
      const data = await res.json() as Record<string, Array<{ key: string; label: string; sort_order: number; visible: boolean }>>;
      // Merge with SECTION_DEFS so every section appears even before saved
      const merged: Record<string, LocalSection[]> = {};
      for (const [page, defs] of Object.entries(SECTION_DEFS)) {
        const saved = data[page] ?? [];
        const savedMap = Object.fromEntries(saved.map(s => [s.key, s]));
        const full: LocalSection[] = defs.map((def, i) => ({
          key: def.key,
          label: savedMap[def.key]?.label ?? def.label,
          sort_order: savedMap[def.key]?.sort_order ?? i,
          visible: savedMap[def.key]?.visible ?? true,
        }));
        full.sort((a, b) => a.sort_order - b.sort_order);
        merged[page] = full;
      }
      setSectionConfig(merged);
    } catch { toast.error('Failed to load section config.'); }
    finally { setLoadingSections(false); }
  };

  useEffect(() => {
    if (tab === 'sections') fetchSectionConfig();
  }, [tab]);

  const saveSectionPage = async (page: string, sections: LocalSection[]) => {
    setSavingSections(page);
    try {
      const res = await fetch('/api/admin/section-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page, sections: sections.map((s, i) => ({ ...s, sort_order: i })) }),
      });
      if (!res.ok) throw new Error();
      invalidateSectionConfig(page);
      toast.success('Saved!');
    } catch { toast.error('Failed to save section config.'); }
    finally { setSavingSections(null); }
  };

  const moveSectionItem = (page: string, index: number, dir: -1 | 1) => {
    const arr = [...(sectionConfig[page] ?? [])];
    const swapIdx = index + dir;
    if (swapIdx < 0 || swapIdx >= arr.length) return;
    [arr[index], arr[swapIdx]] = [arr[swapIdx], arr[index]];
    const updated = { ...sectionConfig, [page]: arr };
    setSectionConfig(updated);
    saveSectionPage(page, arr);
  };

  const toggleSectionVisible = (page: string, key: string) => {
    const arr = (sectionConfig[page] ?? []).map(s => s.key === key ? { ...s, visible: !s.visible } : s);
    setSectionConfig(prev => ({ ...prev, [page]: arr }));
    saveSectionPage(page, arr);
  };

  const saveSectionLabel = async (page: string, key: string) => {
    if (!editLabelValue.trim()) { toast.error('Label cannot be empty.'); return; }
    const arr = (sectionConfig[page] ?? []).map(s => s.key === key ? { ...s, label: editLabelValue.trim() } : s);
    setSectionConfig(prev => ({ ...prev, [page]: arr }));
    setEditingSectionLabel(null);
    await saveSectionPage(page, arr);
  };

  const handleColumnToggle = async (tableName: string, columnKey: string, visible: boolean) => {
    const saveKey = `${tableName}:${columnKey}`;
    setSavingCol(saveKey);
    // Optimistic update
    setTableConfig(prev => ({
      ...prev,
      [tableName]: { ...(prev[tableName] ?? {}), [columnKey]: visible },
    }));
    try {
      const res = await fetch('/api/admin/table-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: tableName, column: columnKey, visible }),
      });
      if (!res.ok) throw new Error();
      invalidateTableColumnConfig(tableName);
    } catch {
      toast.error('Failed to save column visibility.');
      // Revert
      setTableConfig(prev => ({
        ...prev,
        [tableName]: { ...(prev[tableName] ?? {}), [columnKey]: !visible },
      }));
    } finally { setSavingCol(null); }
  };

  const isColVisible = (tableName: string, columnKey: string): boolean => {
    const tbl = tableConfig[tableName];
    if (!tbl || !(columnKey in tbl)) return true; // default visible
    return tbl[columnKey];
  };

  // ── Brand tab ────────────────────────────────────────────────────────────────

  const fetchBrandColors = async () => {
    setLoadingBrand(true);
    try {
      const res = await fetch('/api/admin/settings');
      if (!res.ok) throw new Error();
      const data = await res.json() as Record<string, string>;
      const colors: Record<BrandColorKey, string> = { ...BRAND_COLOR_DEFAULTS };
      for (const key of Object.keys(BRAND_COLOR_DEFAULTS) as BrandColorKey[]) {
        if (data[key]) colors[key] = data[key];
      }
      setBrandColors(colors);
      setBrandDraft(colors);
      const name = data['app_name'] ?? '';
      setSavedAppName(name);
      setAppNameInput(name);
    } catch { toast.error('Failed to load brand colors.'); }
    finally { setLoadingBrand(false); }
  };

  useEffect(() => {
    if (tab === 'brand') fetchBrandColors();
  }, [tab]);

  const handleBrandColorChange = (key: BrandColorKey, hex: string) => {
    setBrandDraft(prev => ({ ...prev, [key]: hex }));
    const channels = hexToRgbChannels(hex);
    if (channels) document.documentElement.style.setProperty(BRAND_CSS_VARS[key], channels);
  };

  const handleSaveBrand = async () => {
    setSavingBrand(true);
    try {
      await Promise.all(
        (Object.entries(brandDraft) as [BrandColorKey, string][]).map(([key, value]) =>
          fetch('/api/admin/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value }),
          })
        )
      );
      setBrandColors({ ...brandDraft });
      toast.success('Brand colors saved!');
    } catch { toast.error('Failed to save brand colors.'); }
    finally { setSavingBrand(false); }
  };

  const handleResetBrand = async () => {
    if (!confirm('Reset all brand colors to defaults?')) return;
    setBrandDraft({ ...BRAND_COLOR_DEFAULTS });
    for (const key of Object.keys(BRAND_COLOR_DEFAULTS) as BrandColorKey[]) {
      document.documentElement.style.setProperty(BRAND_CSS_VARS[key], hexToRgbChannels(BRAND_COLOR_DEFAULTS[key]));
    }
    setSavingBrand(true);
    try {
      await Promise.all(
        (Object.entries(BRAND_COLOR_DEFAULTS) as [BrandColorKey, string][]).map(([key, value]) =>
          fetch('/api/admin/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value }),
          })
        )
      );
      setBrandColors({ ...BRAND_COLOR_DEFAULTS });
      toast.success('Brand colors reset to defaults.');
    } catch { toast.error('Failed to reset brand colors.'); }
    finally { setSavingBrand(false); }
  };

  const handleSaveAppName = async () => {
    const trimmed = appNameInput.trim();
    setSavingAppName(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'app_name', value: trimmed }),
      });
      if (!res.ok) throw new Error();
      setSavedAppName(trimmed);
      invalidateAppName();
      toast.success(trimmed ? 'App name saved.' : 'App name reset to default.');
    } catch { toast.error('Failed to save app name.'); }
    finally { setSavingAppName(false); }
  };

  // ── Permissions tab ──────────────────────────────────────────────────────────

  const fetchSettings = async () => {
    setLoadingPerms(true);
    try {
      const res = await fetch('/api/admin/settings');
      if (!res.ok) throw new Error();
      const data = await res.json() as Record<string, string>;
      setAllowUpload(data['allow_attendee_upload'] !== 'false');
      const domain = data['allowed_email_domain'] ?? '';
      setAllowedDomain(domain);
      setDomainInput(domain);
    } catch { toast.error('Failed to load settings.'); }
    finally { setLoadingPerms(false); }
  };

  useEffect(() => {
    if (tab === 'permissions') fetchSettings();
  }, [tab]);

  const handleUploadToggle = async (value: boolean) => {
    setAllowUpload(value);
    setSavingPerms(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'allow_attendee_upload', value: String(value) }),
      });
      if (!res.ok) throw new Error();
      toast.success(value ? 'Attendee list upload enabled.' : 'Attendee list upload restricted.');
    } catch {
      toast.error('Failed to save permission.');
      setAllowUpload(!value);
    } finally { setSavingPerms(false); }
  };

  const handleSaveDomain = async () => {
    const trimmed = domainInput.trim().replace(/^@/, '');
    setSavingDomain(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'allowed_email_domain', value: trimmed }),
      });
      if (!res.ok) throw new Error();
      setAllowedDomain(trimmed);
      setDomainInput(trimmed);
      toast.success(trimmed ? `Domain restriction set to @${trimmed}.` : 'Domain restriction removed.');
    } catch { toast.error('Failed to save domain setting.'); }
    finally { setSavingDomain(false); }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <BackButton />
      <div>
        <h1 className="text-2xl font-bold text-procare-dark-blue font-serif">Admin Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage dropdown options, table column visibility, and user permissions.</p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {(['types', 'tables', 'sections', 'brand', 'permissions'] as Tab[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${tab === t ? 'border-procare-bright-blue text-procare-bright-blue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t === 'types' ? 'Types' : t === 'tables' ? 'Edit Tables' : t === 'sections' ? 'Section Management' : t === 'brand' ? 'Brand' : 'Permissions'}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Types tab ── */}
      {tab === 'types' && (
        isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-procare-bright-blue border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {CATEGORIES.map(cat => (
              <CategorySection key={cat.key} category={cat.key} label={cat.label} options={optionsByCategory[cat.key] || []} onRefresh={fetchAll} />
            ))}
          </div>
        )
      )}

      {/* ── Edit Tables tab ── */}
      {tab === 'tables' && (
        loadingTables ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-procare-bright-blue border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-gray-500">Toggle columns on or off for each table. Changes take effect immediately for all users.</p>
            {Object.entries(TABLE_COLUMN_DEFS).map(([tableName, cols]) => (
              <div key={tableName} className="card">
                <h2 className="text-base font-semibold text-procare-dark-blue font-serif mb-4">
                  {TABLE_LABELS[tableName] ?? tableName}
                </h2>
                <div className="divide-y divide-gray-100">
                  {cols.map(col => {
                    const visible = isColVisible(tableName, col.key);
                    const saveKey = `${tableName}:${col.key}`;
                    return (
                      <div key={col.key} className="flex items-center justify-between py-3">
                        <span className="text-sm text-gray-700">{col.label}</span>
                        <div className="flex items-center gap-2">
                          {savingCol === saveKey && (
                            <span className="text-xs text-gray-400">Saving…</span>
                          )}
                          <Toggle
                            checked={visible}
                            onChange={v => handleColumnToggle(tableName, col.key, v)}
                            disabled={savingCol === saveKey}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Section Management tab ── */}
      {tab === 'sections' && (
        loadingSections ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-procare-bright-blue border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-gray-500">Customize the title, order, and visibility of sections on Attendee and Company detail pages. Changes take effect immediately for all users.</p>
            {Object.entries(SECTION_DEFS).map(([page]) => {
              const sections = sectionConfig[page] ?? [];
              return (
                <div key={page} className="card">
                  <h2 className="text-base font-semibold text-procare-dark-blue font-serif mb-4">
                    {SECTION_PAGE_LABELS[page] ?? page}
                  </h2>
                  <div className="divide-y divide-gray-100">
                    {sections.map((section, index) => {
                      const isEditing = editingSectionLabel?.page === page && editingSectionLabel?.key === section.key;
                      return (
                        <div key={section.key} className="flex items-center gap-3 py-3">
                          {/* Up/Down */}
                          <div className="flex flex-col gap-0.5 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => moveSectionItem(page, index, -1)}
                              disabled={index === 0 || savingSections === page}
                              className="p-0.5 text-gray-400 hover:text-procare-bright-blue disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Move up"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => moveSectionItem(page, index, 1)}
                              disabled={index === sections.length - 1 || savingSections === page}
                              className="p-0.5 text-gray-400 hover:text-procare-bright-blue disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Move down"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            </button>
                          </div>

                          {/* Label */}
                          <div className="flex-1 min-w-0">
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <input
                                  value={editLabelValue}
                                  onChange={e => setEditLabelValue(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') saveSectionLabel(page, section.key); if (e.key === 'Escape') setEditingSectionLabel(null); }}
                                  className="input-field flex-1 text-sm"
                                  autoFocus
                                />
                                <button type="button" onClick={() => saveSectionLabel(page, section.key)} className="btn-primary text-xs px-3 py-1.5">Save</button>
                                <button type="button" onClick={() => setEditingSectionLabel(null)} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className={`text-sm ${section.visible ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{section.label}</span>
                                <button
                                  type="button"
                                  onClick={() => { setEditingSectionLabel({ page, key: section.key }); setEditLabelValue(section.label); }}
                                  className="text-procare-bright-blue hover:text-procare-dark-blue text-xs font-medium"
                                >
                                  Edit
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Visibility toggle */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {savingSections === page && <span className="text-xs text-gray-400">Saving…</span>}
                            <Toggle
                              checked={section.visible}
                              onChange={() => toggleSectionVisible(page, section.key)}
                              disabled={savingSections === page}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Brand tab ── */}
      {tab === 'brand' && (
        loadingBrand ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-procare-bright-blue border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-gray-500">Customize the application&apos;s primary brand colors. Changes apply as a live preview instantly — click Save to persist for all users.</p>

            {/* Live preview */}
            <div className="card overflow-hidden p-0">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Live Preview</span>
              </div>
              <div className="px-5 py-4 flex flex-wrap items-center gap-4">
                <h3 className="text-procare-dark-blue font-serif font-semibold text-lg leading-none">Heading</h3>
                <button type="button" className="btn-primary text-xs py-1.5 px-3 pointer-events-none">Primary Button</button>
                <button type="button" className="btn-secondary text-xs py-1.5 px-3 pointer-events-none">Secondary Button</button>
                <button type="button" className="btn-gold text-xs py-1.5 px-3 pointer-events-none">Gold Button</button>
                <span className="text-procare-bright-blue text-sm font-medium">Link text</span>
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-procare-bright-blue/10 text-procare-bright-blue">Badge</span>
                <div className="flex gap-1.5">
                  {(Object.keys(BRAND_COLOR_DEFAULTS) as BrandColorKey[]).map(key => (
                    <div key={key} className="w-5 h-5 rounded-full border border-white shadow-sm ring-1 ring-gray-200" style={{ backgroundColor: brandDraft[key] }} title={BRAND_COLOR_META[key].label} />
                  ))}
                </div>
              </div>
            </div>

            {/* App Name */}
            <div className="card">
              <h2 className="text-base font-semibold text-procare-dark-blue font-serif mb-1">App Name</h2>
              <p className="text-sm text-gray-500 mb-4">Set the application name shown in the browser tab, header, and emails. Leave blank to use the <code className="bg-gray-100 px-1 rounded text-xs">NEXT_PUBLIC_APP_NAME</code> environment variable, or &quot;Conference Hub&quot; if unset.</p>
              <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                <input
                  type="text"
                  value={appNameInput}
                  onChange={e => setAppNameInput(e.target.value)}
                  placeholder={process.env.NEXT_PUBLIC_APP_NAME ?? 'Conference Hub'}
                  className="input-field text-sm flex-1"
                />
                <button
                  type="button"
                  onClick={handleSaveAppName}
                  disabled={savingAppName || appNameInput.trim() === savedAppName}
                  className="btn-primary text-sm flex-shrink-0"
                >
                  {savingAppName ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>

            {/* Color pickers */}
            <div className="card">
              <h2 className="text-base font-semibold text-procare-dark-blue font-serif mb-1">Brand Colors</h2>
              <p className="text-sm text-gray-500 mb-5">Pick a color or paste a hex code. The preview above updates immediately.</p>
              <div className="divide-y divide-gray-100">
                {(Object.keys(BRAND_COLOR_DEFAULTS) as BrandColorKey[]).map(key => {
                  const { label, description } = BRAND_COLOR_META[key];
                  const hex = brandDraft[key];
                  const isDefault = hex.toUpperCase() === BRAND_COLOR_DEFAULTS[key].toUpperCase();
                  return (
                    <div key={key} className="flex items-center gap-4 py-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">{label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!isDefault && (
                          <button
                            type="button"
                            onClick={() => handleBrandColorChange(key, BRAND_COLOR_DEFAULTS[key])}
                            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                            title="Reset to default"
                          >
                            Reset
                          </button>
                        )}
                        <input
                          type="text"
                          value={hex}
                          onChange={e => {
                            const v = e.target.value;
                            if (/^#?[0-9A-Fa-f]{0,6}$/.test(v)) {
                              handleBrandColorChange(key, v.startsWith('#') ? v : `#${v}`);
                            }
                          }}
                          className="w-24 px-2 py-1.5 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-procare-bright-blue"
                          spellCheck={false}
                        />
                        <label className="cursor-pointer flex-shrink-0 relative" title="Pick color">
                          <input
                            type="color"
                            value={/^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : BRAND_COLOR_DEFAULTS[key]}
                            onChange={e => handleBrandColorChange(key, e.target.value)}
                            className="sr-only"
                          />
                          <div
                            className="w-9 h-9 rounded-lg border-2 border-gray-200 hover:border-procare-bright-blue transition-colors"
                            style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : BRAND_COLOR_DEFAULTS[key] }}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleResetBrand}
                  disabled={savingBrand}
                  className="btn-secondary text-sm"
                >
                  Reset All to Defaults
                </button>
                <button
                  type="button"
                  onClick={handleSaveBrand}
                  disabled={savingBrand || JSON.stringify(brandDraft) === JSON.stringify(brandColors)}
                  className="btn-primary text-sm"
                >
                  {savingBrand ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )
      )}

      {/* ── Permissions tab ── */}
      {tab === 'permissions' && (
        loadingPerms ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-procare-bright-blue border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="card">
              <h2 className="text-base font-semibold text-procare-dark-blue font-serif mb-1">Conference Attendee List Upload</h2>
              <p className="text-sm text-gray-500 mb-4">Control whether regular users can upload attendee lists to conferences. Administrators can always upload.</p>
              <div className="flex items-center justify-between py-3 border-t border-gray-100">
                <div>
                  <p className="text-sm font-medium text-gray-700">Allow regular users to upload attendee lists</p>
                  <p className="text-xs text-gray-400 mt-0.5">{allowUpload ? 'Enabled — all users can upload' : 'Restricted — administrators only'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {savingPerms && <span className="text-xs text-gray-400">Saving…</span>}
                  <Toggle checked={allowUpload} onChange={handleUploadToggle} disabled={savingPerms} />
                </div>
              </div>
            </div>

            <div className="card">
              <h2 className="text-base font-semibold text-procare-dark-blue font-serif mb-1">Email Domain Restriction</h2>
              <p className="text-sm text-gray-500 mb-4">Restrict new account sign-ups to a specific email domain. Leave blank to allow any email address.</p>
              <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                <span className="text-sm text-gray-500 flex-shrink-0">@</span>
                <input
                  type="text"
                  value={domainInput}
                  onChange={e => setDomainInput(e.target.value.replace(/^@/, ''))}
                  placeholder="yourcompany.com"
                  className="input-field flex-1 text-sm"
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveDomain(); }}
                />
                <button
                  type="button"
                  onClick={handleSaveDomain}
                  disabled={savingDomain || domainInput.trim().replace(/^@/, '') === allowedDomain}
                  className="btn-primary text-sm flex-shrink-0"
                >
                  {savingDomain ? 'Saving…' : 'Save'}
                </button>
              </div>
              {allowedDomain && (
                <p className="text-xs text-gray-400 mt-2">Currently restricted to <span className="font-medium text-gray-600">@{allowedDomain}</span></p>
              )}
              {!allowedDomain && (
                <p className="text-xs text-gray-400 mt-2">No restriction — any email address may sign up.</p>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}
