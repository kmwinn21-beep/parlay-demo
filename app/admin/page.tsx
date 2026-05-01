'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { BackButton } from '@/components/BackButton';
import { COLOR_PRESETS, getPreset } from '@/lib/colors';
import { invalidateConfigColors } from '@/lib/useConfigColors';
import { invalidateConfigOptions } from '@/lib/useConfigOptions';
import { TABLE_COLUMN_DEFS, invalidateTableColumnConfig, invalidateCustomColumns, type CustomColumnDef } from '@/lib/useTableColumnConfig';
import { AVAILABLE_COLUMNS, DISPLAY_TYPE_LABELS, type DisplayType } from '@/lib/customColumnDefs';
import { SECTION_DEFS, invalidateSectionConfig } from '@/lib/useSectionConfig';
import { CATEGORY_FORM_USAGE } from '@/lib/configOptionForms';
import { BRAND_COLOR_DEFAULTS, BRAND_COLOR_META, BRAND_CSS_VARS, hexToRgbChannels, FONT_OPTIONS, DEFAULT_FONT_KEY, type BrandColorKey } from '@/lib/brand';
import { invalidateAppName } from '@/lib/useAppName';
import { invalidateLogoConfig } from '@/lib/useLogoConfig';
import { invalidateTagline } from '@/lib/useTagline';
import { invalidateUnitTypeLabel } from '@/lib/useUnitTypeLabel';

interface ConfigOption {
  id: number;
  category: string;
  value: string;
  sort_order: number;
  color: string | null;
  visible_forms?: string[];
  scope?: string; // 'global' | 'user' — only meaningful for status category
  auto_follow_up?: number; // 1 = yes, 0 = no — only meaningful for touchpoints category
  is_system?: number; // 1 = seeded system value, cannot be deleted
}

const CATEGORIES = [
  { key: 'company_type', label: 'Company Types' },
  { key: 'entity_structure', label: 'Entity Structure' },
  { key: 'status', label: 'Status Options' },
  { key: 'action', label: 'Actions' },
  { key: 'next_steps', label: 'Next Steps' },
  { key: 'seniority', label: 'Seniority Levels' },
  { key: 'function', label: 'Function' },
  { key: 'products', label: 'Products' },
  { key: 'profit_type', label: 'Profit Types' },
  { key: 'services', label: 'Services' },
  { key: 'icp', label: 'ICP' },
  { key: 'meeting_type', label: 'Meeting Type' },
  { key: 'event_type', label: 'Event Type' },
  { key: 'rep_relationship_type', label: 'Rep Relationship Type/Status' },
  { key: 'touchpoints', label: 'Touchpoints' },
  { key: 'attendee_conference_status', label: 'Attendee Conference Status' },
  { key: 'user', label: 'Users' },
  { key: 'cost_type', label: 'Cost Types' },
];

const TABLE_LABELS: Record<string, string> = {
  attendees:             'Attendees Table',
  companies:             'Companies Table',
  follow_ups:            'Follow Ups Table',
  meetings:              'Meetings Table',
  social_events:         'Social Events Table',
  conference_attendees:  'Conference Attendee Table',
  conference_companies:  'Conference Company Table',
  attendee_meetings:     'Attendee Detail — Meetings',
  attendee_follow_ups:   'Attendee Detail — Follow Ups',
  company_meetings:      'Company Detail — Meetings',
  company_follow_ups:    'Company Detail — Follow Ups',
  conference_meetings:   'Conference Detail — Meetings',
};

type Tab = 'types' | 'tables' | 'sections' | 'brand' | 'permissions' | 'icp' | 'forms' | 'users' | 'email-templates' | 'integrations' | 'effectiveness';

interface IcpRuleDraft {
  id?: number;
  category: string;
  conditions: { option_value: string; operator: 'AND' | 'OR' }[];
  isEditing: boolean;
  isSaving: boolean;
}

type IcpUnitTypeOperator = 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'between';

const ICP_OPERATOR_LABELS: Record<IcpUnitTypeOperator, string> = {
  eq: '=',
  gt: '>',
  lt: '<',
  gte: '≥',
  lte: '≤',
  between: 'between',
};

const ICP_RULE_CATEGORIES = [
  { key: 'company_type', label: 'Company Types' },
  { key: 'entity_structure', label: 'Entity Structure' },
  { key: 'profit_type', label: 'Profit Types' },
  { key: 'services', label: 'Services' },
  { key: 'status', label: 'Status Options' },
];

const SECTION_PAGE_LABELS: Record<string, string> = {
  attendee: 'Attendee Page',
  company: 'Company Page',
  conference_details: 'Conference Details Page',
  relationships_page: 'Relationships Page',
  pre_conference_review: 'Pre-Conference Review',
  post_conference_review: 'Post-Conference Review',
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
              <button key={p.key} type="button" onClick={() => handleSelect(p.key)} className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${currentColor === p.key ? 'border-brand-primary ring-2 ring-brand-secondary/30' : 'border-gray-200 hover:border-gray-400'}`} style={{ backgroundColor: p.swatch }} title={p.label} />
            ))}
          </div>
          {currentColor && <button type="button" onClick={() => handleSelect(null)} className="w-full mt-2 text-xs text-gray-400 hover:text-gray-600 py-1">Reset to default</button>}
        </div>
      )}
    </div>
  );
}

function MultiSelectDropdown({ options, selected, onChange, placeholder = 'None' }: { options: string[]; selected: string[]; onChange: (vals: string[]) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  const toggle = (val: string) => onChange(selected.includes(val) ? selected.filter(s => s !== val) : [...selected, val]);
  const label = selected.length === 0 ? placeholder : selected.join(', ');
  return (
    <div ref={ref} className="relative w-full">
      <button type="button" onClick={() => setOpen(p => !p)} className="input-field text-sm py-0.5 w-full text-left flex items-center justify-between gap-1">
        <span className={`truncate ${selected.length === 0 ? 'text-gray-400' : 'text-gray-800'}`}>{label}</span>
        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && options.length > 0 && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full min-w-max bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm whitespace-nowrap">
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} className="rounded" />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function CategorySection({ category, label, options, onRefresh }: { category: string; label: string; options: ConfigOption[]; onRefresh: () => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localOptions, setLocalOptions] = useState<ConfigOption[]>(options);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editVisibleForms, setEditVisibleForms] = useState<string[]>([]);
  const [editScope, setEditScope] = useState<'global' | 'user'>('global');
  const [isAdding, setIsAdding] = useState(false);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [expandedOptions, setExpandedOptions] = useState<Set<number>>(new Set());
  const [formPickerOpenId, setFormPickerOpenId] = useState<number | null>(null);
  const availableForms = CATEGORY_FORM_USAGE[category] ?? [];
  const showScopeDropdown = category === 'status';
  const showAutoFollowUp = category === 'touchpoints';
  const [editAutoFollowUp, setEditAutoFollowUp] = useState<boolean>(true);

  useEffect(() => { setLocalOptions(options); }, [options]);

  const handleEdit = (opt: ConfigOption) => {
    setEditingId(opt.id);
    setEditValue(opt.value);
    setEditVisibleForms(opt.visible_forms ?? availableForms.map(f => f.key));
    setEditScope((opt.scope === 'user' ? 'user' : 'global') as 'global' | 'user');
    setEditAutoFollowUp(opt.auto_follow_up === undefined ? true : opt.auto_follow_up !== 0);
    setFormPickerOpenId(null);
    setExpandedOptions(prev => new Set(prev).add(opt.id));
  };

  const handleSaveEdit = async (id: number) => {
    if (!editValue.trim()) { toast.error('Value cannot be empty.'); return; }
    try {
      const payload: Record<string, unknown> = { value: editValue.trim(), visible_forms: editVisibleForms };
      if (showScopeDropdown) payload.scope = editScope;
      if (showAutoFollowUp) payload.auto_follow_up = editAutoFollowUp;
      const res = await fetch(`/api/config/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Update failed');
      setLocalOptions(prev => prev.map(opt => opt.id === id ? { ...opt, value: editValue.trim(), visible_forms: [...editVisibleForms], scope: showScopeDropdown ? editScope : opt.scope, auto_follow_up: showAutoFollowUp ? (editAutoFollowUp ? 1 : 0) : opt.auto_follow_up } : opt));
      toast.success('Updated!');
      setEditingId(null);
      setExpandedOptions(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setFormPickerOpenId(null);
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
      setLocalOptions(prev => [...prev, {
        id: Number(newOption.id),
        category: String(newOption.category),
        value: String(newOption.value),
        sort_order: Number(newOption.sort_order ?? 0),
        color: newOption.color ? String(newOption.color) : null,
        visible_forms: availableForms.map(f => f.key),
      }]);
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
  const toggleForm = (formKey: string) => {
    setEditVisibleForms(prev => prev.includes(formKey) ? prev.filter(f => f !== formKey) : [...prev, formKey]);
  };

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setIsExpanded(prev => !prev)}
        className="w-full flex items-center justify-between text-left"
      >
        <h2 className="text-lg font-semibold text-brand-primary font-serif">{label}</h2>
        <svg
          className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isExpanded && (
        <div className="pt-4">
          {localOptions.length === 0 ? <p className="text-sm text-gray-400 mb-4">No options yet.</p> : (
            <ul className="space-y-1 mb-4">
              {localOptions.map((opt, index) => {
                const isOptionExpanded = expandedOptions.has(opt.id);
                const isEditing = editingId === opt.id;
                return (
                  <li key={opt.id} draggable={!isOptionExpanded} onDragStart={() => handleDragStart(index)} onDragOver={(e) => handleDragOver(e, index)} onDrop={(e) => handleDrop(e, index)} onDragEnd={handleDragEnd} className={['rounded-lg transition-all border border-transparent', isDragging && dragIndexRef.current === index ? 'opacity-40' : '', dragOverIndex === index && dragIndexRef.current !== index ? 'ring-2 ring-brand-secondary ring-offset-1' : '', isOptionExpanded ? 'bg-gray-50 border-gray-200' : ''].join(' ')}>
                    <div className="flex items-center gap-2 px-1 py-1">
                      <DragHandle />
                      <ColorPicker optionId={opt.id} currentColor={opt.color} onColorSaved={onRefresh} />
                      <span className="flex-1 text-sm text-gray-800 py-1.5 px-2 rounded flex items-center gap-2">
                        {opt.value}
                        {showScopeDropdown && opt.scope === 'user' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">User</span>
                        )}
                      </span>
                      <button type="button" onClick={() => handleEdit(opt)} className="text-brand-secondary hover:text-brand-primary text-xs font-medium px-2 py-1">Edit</button>
                      {!opt.is_system && (
                        <button type="button" onClick={() => handleDelete(opt.id, opt.value)} className="text-red-400 hover:text-red-600 text-xs font-medium px-2 py-1">Delete</button>
                      )}
                    </div>
                    {isOptionExpanded && (
                      <div className="px-7 pb-3 pt-1 border-t border-gray-200 space-y-3">
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">Option Name</label>
                          <input
                            value={isEditing ? editValue : opt.value}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="input-field w-full text-sm"
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(opt.id); if (e.key === 'Escape') setEditingId(null); }}
                            autoFocus={isEditing}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">Visible In Forms</label>
                          {availableForms.length === 0 ? (
                            <p className="text-xs text-gray-400">No mapped forms for this option category yet.</p>
                          ) : (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setFormPickerOpenId(prev => prev === opt.id ? null : opt.id)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between gap-2 hover:border-brand-secondary transition-colors bg-white"
                              >
                                <span className="truncate">{editVisibleForms.length === 0 ? 'No forms selected' : `${editVisibleForms.length} form(s) selected`}</span>
                                <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${formPickerOpenId === opt.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              {formPickerOpenId === opt.id && (
                                <div className="absolute z-30 top-full mt-1 left-0 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto divide-y divide-gray-100">
                                  {availableForms.map((form) => (
                                    <label key={form.key} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                                      <input
                                        type="checkbox"
                                        className="accent-brand-secondary"
                                        checked={editVisibleForms.includes(form.key)}
                                        onChange={() => toggleForm(form.key)}
                                      />
                                      <span>{form.label}</span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {showScopeDropdown && (
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">Visibility Scope</label>
                            <div className="inline-flex items-center rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                              {(['global', 'user'] as const).map(s => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => setEditScope(s)}
                                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${editScope === s ? 'bg-brand-secondary text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                  {s === 'global' ? 'Global' : 'User'}
                                </button>
                              ))}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1">
                              {editScope === 'user'
                                ? 'Only visible to the user who set it — shows as "StatusName - Initials" on company profiles.'
                                : 'Visible to all users across all tables and views.'}
                            </p>
                          </div>
                        )}
                        {showAutoFollowUp && (
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">Automatically Assign Follow Up</label>
                            <div className="flex items-center gap-3">
                              <div className="inline-flex items-center rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                                {([true, false] as const).map(v => (
                                  <button
                                    key={String(v)}
                                    type="button"
                                    onClick={() => setEditAutoFollowUp(v)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${editAutoFollowUp === v ? 'bg-brand-secondary text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                  >
                                    {v ? 'Yes' : 'No'}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1">
                              When enabled, logging this touchpoint will automatically create a follow-up task.
                            </p>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => handleSaveEdit(opt.id)} className="btn-primary text-xs px-3 py-1.5">Save</button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setExpandedOptions(prev => {
                                const next = new Set(prev);
                                next.delete(opt.id);
                                return next;
                              });
                              setFormPickerOpenId(null);
                            }}
                            className="btn-secondary text-xs px-3 py-1.5"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <form onSubmit={handleAdd} className="flex gap-2 pt-3 border-t border-gray-100">
            <input name="newOption" placeholder={`Add new ${label.toLowerCase().replace(/s$/, '')}...`} className="input-field flex-1 text-sm" autoComplete="off" />
            <button type="submit" disabled={isAdding} className="btn-primary text-sm">{isAdding ? 'Adding...' : 'Add'}</button>
          </form>
        </div>
      )}
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
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${checked ? 'bg-brand-secondary' : 'bg-gray-200'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function TagInput({ tags, onChange, placeholder }: { tags: string[]; onChange: (tags: string[]) => void; placeholder: string }) {
  const [inputValue, setInputValue] = useState('');
  const add = (raw: string) => {
    const v = raw.trim().replace(/,$/, '').trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setInputValue('');
  };
  return (
    <div
      className="flex flex-wrap gap-1.5 border border-gray-200 rounded-lg p-2 min-h-[42px] cursor-text"
      onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus()}
    >
      {tags.map(t => (
        <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
          {t}
          <button type="button" onClick={() => onChange(tags.filter(x => x !== t))} className="text-gray-400 hover:text-gray-600 leading-none">×</button>
        </span>
      ))}
      <input
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(inputValue); }
          if (e.key === 'Backspace' && !inputValue && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={() => { if (inputValue.trim()) add(inputValue); }}
        className="flex-1 min-w-[120px] text-sm outline-none bg-transparent"
        placeholder={tags.length === 0 ? placeholder : ''}
      />
    </div>
  );
}

// ─── Add Column Modal ─────────────────────────────────────────────────────────

interface AddColumnPayload {
  column_key: string;
  label: string;
  data_key: string;
  config_category: string | null;
  is_user_field: boolean;
  display_type: DisplayType;
  display_config: { prefix?: string; icon_color?: string; name_format?: 'full' | 'initials' | 'first_last_initial' } | null;
}

function AddColumnModal({ tableName, existingKeys, onClose, onAdd }: {
  tableName: string;
  existingKeys: string[];
  onClose: () => void;
  onAdd: (col: AddColumnPayload) => void;
}) {
  const available = (AVAILABLE_COLUMNS[tableName] ?? []).filter(c => !existingKeys.includes(c.key));
  const [selectedKey, setSelectedKey] = useState('');
  const [displayType, setDisplayType] = useState<DisplayType>('text_value');
  const [label, setLabel] = useState('');
  const [prefix, setPrefix] = useState('');
  const [iconColor, setIconColor] = useState('#6b7280');
  const [nameFormat, setNameFormat] = useState<'full' | 'initials' | 'first_last_initial'>('full');

  const selectedDef = available.find(c => c.key === selectedKey);

  useEffect(() => {
    if (selectedDef) {
      setLabel(selectedDef.label);
      setDisplayType(selectedDef.default_display_type);
    }
  }, [selectedKey]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDef) return;
    let display_config: AddColumnPayload['display_config'] = null;
    if (displayType === 'text_value' && prefix.trim()) display_config = { prefix: prefix.trim() };
    if (displayType === 'icon_tooltip') display_config = { icon_color: iconColor };
    if (displayType === 'user_icon_pill') display_config = { name_format: nameFormat };
    onAdd({
      column_key: selectedDef.key,
      label: label.trim() || selectedDef.label,
      data_key: selectedDef.data_key,
      config_category: selectedDef.config_category,
      is_user_field: selectedDef.is_user_field,
      display_type: displayType,
      display_config,
    });
  };

  if (available.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
          <h2 className="text-base font-semibold text-brand-primary font-serif mb-2">Add Column</h2>
          <p className="text-sm text-gray-500 mb-4">All available columns have already been added to this table.</p>
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-brand-primary font-serif">Add Column</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Step 1: Pick column */}
          <div>
            <label className="label text-xs">Column</label>
            <select
              value={selectedKey}
              onChange={e => setSelectedKey(e.target.value)}
              className="input-field"
              required
            >
              <option value="">— Select a column —</option>
              {available.map(c => (
                <option key={c.key} value={c.key}>{c.label} <span className="text-gray-400">({c.source})</span></option>
              ))}
            </select>
          </div>

          {selectedDef && (
            <>
              {/* Label */}
              <div>
                <label className="label text-xs">Display Label</label>
                <input type="text" value={label} onChange={e => setLabel(e.target.value)} required className="input-field" placeholder={selectedDef.label} />
              </div>

              {/* Display Type */}
              <div>
                <label className="label text-xs">Display Format</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(DISPLAY_TYPE_LABELS) as [DisplayType, string][]).map(([key, lbl]) => (
                    <label key={key} className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors text-sm ${displayType === key ? 'border-brand-secondary bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input type="radio" name="displayType" value={key} checked={displayType === key} onChange={() => setDisplayType(key)} className="accent-brand-secondary" />
                      {lbl}
                    </label>
                  ))}
                </div>
              </div>

              {/* Conditional config */}
              {displayType === 'text_value' && (
                <div>
                  <label className="label text-xs">Prefix <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="text" value={prefix} onChange={e => setPrefix(e.target.value)} className="input-field" placeholder='e.g. "Emp: "' />
                </div>
              )}

              {displayType === 'icon_tooltip' && (
                <div>
                  <label className="label text-xs">Icon Color</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={iconColor} onChange={e => setIconColor(e.target.value)} className="w-10 h-10 rounded border border-gray-200 cursor-pointer p-0.5" />
                    <input type="text" value={iconColor} onChange={e => setIconColor(e.target.value)} className="input-field w-32 font-mono text-sm" placeholder="#6b7280" />
                  </div>
                </div>
              )}

              {displayType === 'user_icon_pill' && (
                <div>
                  <label className="label text-xs">Name Format</label>
                  <div className="space-y-2">
                    {([['full', 'Full Name'], ['first_last_initial', 'First Initial + Last Name'], ['initials', 'Initials Only']] as const).map(([val, lbl]) => (
                      <label key={val} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input type="radio" name="nameFormat" value={val} checked={nameFormat === val} onChange={() => setNameFormat(val)} className="accent-brand-secondary" />
                        {lbl}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
            <button type="submit" disabled={!selectedDef} className="btn-primary text-sm">Add Column</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('types');

  // Types tab
  const [optionsByCategory, setOptionsByCategory] = useState<Record<string, ConfigOption[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Edit Tables tab
  const [tableConfig, setTableConfig] = useState<Record<string, Record<string, { visible: boolean; sort_order: number | null }>>>({});
  const [loadingTables, setLoadingTables] = useState(false);
  const [savingCol, setSavingCol] = useState<string | null>(null);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [dragCol, setDragCol] = useState<{ table: string; key: string } | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [mobileDragFrom, setMobileDragFrom] = useState<{ table: string; key: string } | null>(null);
  const [mobileDragOver, setMobileDragOver] = useState<string | null>(null);
  const [customCols, setCustomCols] = useState<Record<string, CustomColumnDef[]>>({});
  const [addColTable, setAddColTable] = useState<string | null>(null);
  const _mDragFrom = useRef<{ table: string; key: string } | null>(null);
  const _mDragOver = useRef<string | null>(null);
  const _mActivated = useRef(false);
  const _longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sections tab
  type LocalSection = { key: string; label: string; sort_order: number; visible: boolean };
  const [sectionConfig, setSectionConfig] = useState<Record<string, LocalSection[]>>({});
  const [loadingSections, setLoadingSections] = useState(false);
  const [savingSections, setSavingSections] = useState<string | null>(null);
  const [editingSectionLabel, setEditingSectionLabel] = useState<{ page: string; key: string } | null>(null);
  const [editLabelValue, setEditLabelValue] = useState('');
  const [expandedSectionPages, setExpandedSectionPages] = useState<Set<string>>(new Set());

  // Brand tab
  const [brandColors, setBrandColors] = useState<Record<BrandColorKey, string>>({ ...BRAND_COLOR_DEFAULTS });
  const [brandDraft, setBrandDraft] = useState<Record<BrandColorKey, string>>({ ...BRAND_COLOR_DEFAULTS });
  const [loadingBrand, setLoadingBrand] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);
  const [savedAppName, setSavedAppName] = useState('');
  const [appNameInput, setAppNameInput] = useState('');
  const [savingAppName, setSavingAppName] = useState(false);
  const [logoWhiteInput, setLogoWhiteInput] = useState('');
  const [logoDarkInput, setLogoDarkInput] = useState('');
  const [faviconInput, setFaviconInput] = useState('');
  const [logoSidebarInput, setLogoSidebarInput] = useState('');
  const [savedLogoWhite, setSavedLogoWhite] = useState('');
  const [savedLogoDark, setSavedLogoDark] = useState('');
  const [savedFavicon, setSavedFavicon] = useState('');
  const [savedLogoSidebar, setSavedLogoSidebar] = useState('');
  const [savingLogos, setSavingLogos] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState<string | null>(null);
  const [fontKey, setFontKey] = useState(DEFAULT_FONT_KEY);
  const [savedFontKey, setSavedFontKey] = useState(DEFAULT_FONT_KEY);
  const [savingFont, setSavingFont] = useState(false);
  const [taglineInput, setTaglineInput] = useState('');
  const [savedTagline, setSavedTagline] = useState('');
  const [savingTagline, setSavingTagline] = useState(false);

  // Permissions tab
  const [allowUpload, setAllowUpload] = useState(true);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [savingPerms, setSavingPerms] = useState(false);

  // User Management tab
  type AdminUserRow = {
    id: number; email: string; firstName: string | null; lastName: string | null;
    displayName: string | null; role: string; emailVerified: boolean; active: boolean;
    configId: number | null; createdAt: string;
  };
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersList, setUsersList] = useState<AdminUserRow[]>([]);
  const [inviteForm, setInviteForm] = useState({ firstName: '', lastName: '', email: '', role: 'user' as 'user' | 'administrator' });
  const [inviteSending, setInviteSending] = useState(false);
  const [deleteModal, setDeleteModal] = useState<AdminUserRow | null>(null);
  const [reassignToId, setReassignToId] = useState<number | ''>('');
  const [deleting, setDeleting] = useState(false);

  // ── Unit Type (Types tab) ─────────────────────────────────────────────────────
  const [unitTypeLabel, setUnitTypeLabel] = useState('Units');
  const [unitTypeSaving, setUnitTypeSaving] = useState(false);

  // ── ICP tab ──────────────────────────────────────────────────────────────────
  const [icpRules, setIcpRules] = useState<IcpRuleDraft[]>([]);
  const [icpLoading, setIcpLoading] = useState(false);
  const [icpUnitTypeOp, setIcpUnitTypeOp] = useState<IcpUnitTypeOperator | ''>('');
  const [icpUnitTypeV1, setIcpUnitTypeV1] = useState('');
  const [icpUnitTypeV2, setIcpUnitTypeV2] = useState('');
  const [icpUnitTypeSaving, setIcpUnitTypeSaving] = useState(false);
  const [icpUnitTypeConnector, setIcpUnitTypeConnector] = useState<'AND' | 'OR'>('AND');

  // ── ICP extended fields ───────────────────────────────────────────────────────
  const [icpTargetTitles, setIcpTargetTitles] = useState<string[]>([]);
  const [icpSeniorityPriority, setIcpSeniorityPriority] = useState<Record<string, 'High' | 'Medium' | 'Low' | 'Ignore'>>({});
  const [icpFunctionProductMapping, setIcpFunctionProductMapping] = useState<Record<string, string[]>>({});
  const [icpDecisionMakerTitles, setIcpDecisionMakerTitles] = useState<string[]>([]);
  const [icpInfluencerTitles, setIcpInfluencerTitles] = useState<string[]>([]);
  const [savingBuyerPersona, setSavingBuyerPersona] = useState(false);
  const [icpPainPoints, setIcpPainPoints] = useState<string[]>([]);
  const [icpTriggerEvents, setIcpTriggerEvents] = useState<string[]>([]);
  const [icpExclusionDescription, setIcpExclusionDescription] = useState('');
  const [savingPainPoints, setSavingPainPoints] = useState(false);
  const [icpUseCaseDescription, setIcpUseCaseDescription] = useState('');
  const [savingUseCase, setSavingUseCase] = useState(false);
  const [icpPursuitScore, setIcpPursuitScore] = useState('50');
  const [icpWarmScore, setIcpWarmScore] = useState('75');
  const [icpMinTouchpoints, setIcpMinTouchpoints] = useState('1');
  const [icpIncludeNewCompanies, setIcpIncludeNewCompanies] = useState(true);
  const [savingThresholds, setSavingThresholds] = useState(false);

  // ── Types tab ────────────────────────────────────────────────────────────────

  const fetchAll = async () => {
    invalidateConfigColors();
    invalidateConfigOptions();
    try {
      const [catResults, unitTypeRes] = await Promise.all([
        Promise.all(
          CATEGORIES.map(cat =>
            fetch(`/api/config?category=${cat.key}&include_visibility=1`, { cache: 'no-store' })
              .then(r => r.json())
              .then(data => ({ key: cat.key, options: data }))
          )
        ),
        fetch('/api/admin/unit-type', { cache: 'no-store' }).then(r => r.json()),
      ]);
      const map: Record<string, ConfigOption[]> = {};
      for (const r of catResults) {
        map[r.key] = r.key === 'icp'
          ? r.options.filter((o: ConfigOption) => o.value !== 'True' && o.value !== 'False')
          : r.options;
      }
      setOptionsByCategory(map);
      const utData = unitTypeRes as { value: string };
      setUnitTypeLabel(utData.value || 'Units');
    } catch { toast.error('Failed to load config options.'); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSaveUnitType = async () => {
    if (!unitTypeLabel.trim()) return;
    setUnitTypeSaving(true);
    try {
      const res = await fetch('/api/admin/unit-type', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: unitTypeLabel.trim() }),
      });
      // Use text() → JSON.parse() to avoid Safari's res.json() pattern error
      const text = await res.text();
      let data: { value?: string; error?: string } = {};
      try { data = JSON.parse(text); } catch {
        throw new Error(`Unexpected server response (${res.status}): ${text.slice(0, 150)}`);
      }
      if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
      setUnitTypeLabel(String(data.value ?? unitTypeLabel.trim()));
      invalidateUnitTypeLabel();
      toast.success('Unit type saved!');
    } catch (err) { toast.error(`Failed to save unit type: ${err instanceof Error ? err.message : err}`); }
    finally { setUnitTypeSaving(false); }
  };

  const fetchIcpConfig = async () => {
    setIcpLoading(true);
    try {
      const [icpRes, settingsRes] = await Promise.all([
        fetch('/api/admin/icp-rules', { cache: 'no-store' }),
        fetch('/api/admin/settings'),
      ]);
      if (!icpRes.ok) throw new Error();
      const data = await icpRes.json() as { rules: { id: number; category: string; conditions: { option_value: string; operator: 'AND' | 'OR' }[] }[]; unitTypeReq: { operator: IcpUnitTypeOperator | null; value1: number | null; value2: number | null; connector?: 'AND' | 'OR' } };
      setIcpRules(data.rules.map(r => ({ ...r, isEditing: false, isSaving: false })));
      setIcpUnitTypeOp(data.unitTypeReq.operator ?? '');
      setIcpUnitTypeV1(data.unitTypeReq.value1 != null ? String(data.unitTypeReq.value1) : '');
      setIcpUnitTypeV2(data.unitTypeReq.value2 != null ? String(data.unitTypeReq.value2) : '');
      setIcpUnitTypeConnector(data.unitTypeReq.connector ?? 'AND');
      if (settingsRes.ok) {
        const s = await settingsRes.json() as Record<string, string>;
        const tryParse = <T,>(v: string | undefined, fallback: T): T => { try { return v ? JSON.parse(v) as T : fallback; } catch { return fallback; } };
        setIcpTargetTitles(tryParse(s['icp_target_titles'], []));
        setIcpSeniorityPriority(tryParse(s['icp_seniority_priority'], {}));
        setIcpFunctionProductMapping(tryParse(s['icp_function_product_mapping'], {}));
        setIcpDecisionMakerTitles(tryParse(s['icp_decision_maker_titles'], []));
        setIcpInfluencerTitles(tryParse(s['icp_influencer_titles'], []));
        setIcpPainPoints(tryParse(s['icp_pain_points'], []));
        setIcpTriggerEvents(tryParse(s['icp_trigger_events'], []));
        setIcpExclusionDescription(s['icp_exclusion_description'] ?? '');
        setIcpUseCaseDescription(s['icp_use_case_description'] ?? '');
        setIcpPursuitScore(s['icp_pursuit_score'] ?? '50');
        setIcpWarmScore(s['icp_warm_score'] ?? '75');
        setIcpMinTouchpoints(s['icp_min_touchpoints'] ?? '1');
        setIcpIncludeNewCompanies(s['icp_include_new_companies'] !== 'false');
      }
    } catch { toast.error('Failed to load ICP configuration.'); }
    finally { setIcpLoading(false); }
  };

  useEffect(() => { if (tab === 'icp') fetchIcpConfig(); }, [tab]);

  const handleSaveBuyerPersona = async () => {
    setSavingBuyerPersona(true);
    try {
      const res = await Promise.all([
        fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'icp_target_titles', value: JSON.stringify(icpTargetTitles) }) }),
        fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'icp_seniority_priority', value: JSON.stringify(icpSeniorityPriority) }) }),
        fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'icp_function_product_mapping', value: JSON.stringify(icpFunctionProductMapping) }) }),
        fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'icp_decision_maker_titles', value: JSON.stringify(icpDecisionMakerTitles) }) }),
        fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'icp_influencer_titles', value: JSON.stringify(icpInfluencerTitles) }) }),
      ]);
      if (res.some(r => !r.ok)) throw new Error();
      toast.success('Buyer persona saved!');
    } catch { toast.error('Failed to save buyer persona.'); }
    finally { setSavingBuyerPersona(false); }
  };

  const handleSavePainPoints = async () => {
    setSavingPainPoints(true);
    try {
      const res = await Promise.all([
        fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'icp_pain_points', value: JSON.stringify(icpPainPoints) }) }),
        fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'icp_trigger_events', value: JSON.stringify(icpTriggerEvents) }) }),
        fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'icp_exclusion_description', value: icpExclusionDescription }) }),
      ]);
      if (res.some(r => !r.ok)) throw new Error();
      toast.success('Pain points saved!');
    } catch { toast.error('Failed to save pain points.'); }
    finally { setSavingPainPoints(false); }
  };

  const handleSaveUseCase = async () => {
    setSavingUseCase(true);
    try {
      const res = await fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'icp_use_case_description', value: icpUseCaseDescription.trim() }) });
      if (!res.ok) throw new Error();
      toast.success('Use case saved!');
    } catch { toast.error('Failed to save use case.'); }
    finally { setSavingUseCase(false); }
  };

  const handleSaveThresholds = async () => {
    setSavingThresholds(true);
    try {
      const res = await Promise.all([
        fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'icp_pursuit_score', value: icpPursuitScore }) }),
        fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'icp_warm_score', value: icpWarmScore }) }),
        fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'icp_min_touchpoints', value: icpMinTouchpoints }) }),
        fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'icp_include_new_companies', value: String(icpIncludeNewCompanies) }) }),
      ]);
      if (res.some(r => !r.ok)) throw new Error();
      toast.success('Thresholds saved!');
    } catch { toast.error('Failed to save thresholds.'); }
    finally { setSavingThresholds(false); }
  };

  const handleSaveIcpUnitType = async () => {
    setIcpUnitTypeSaving(true);
    try {
      await Promise.all([
        fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'icp_unit_type_operator', value: icpUnitTypeOp || '' }) }),
        fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'icp_unit_type_value1', value: icpUnitTypeV1 }) }),
        fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'icp_unit_type_value2', value: icpUnitTypeOp === 'between' ? icpUnitTypeV2 : '' }) }),
      ]);
      toast.success('Unit type requirement saved!');
    } catch { toast.error('Failed to save unit type requirement.'); }
    finally { setIcpUnitTypeSaving(false); }
  };

  const handleClearIcpUnitType = async () => {
    setIcpUnitTypeOp('');
    setIcpUnitTypeV1('');
    setIcpUnitTypeV2('');
    await Promise.all([
      fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'icp_unit_type_operator', value: '' }) }),
      fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'icp_unit_type_value1', value: '' }) }),
      fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'icp_unit_type_value2', value: '' }) }),
    ]);
    toast.success('Unit type requirement cleared.');
  };

  const handleToggleConnector = async (val: 'AND' | 'OR') => {
    setIcpUnitTypeConnector(val);
    try {
      await fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'icp_unit_type_connector', value: val }) });
      toast.success('Connector updated.');
    } catch { toast.error('Failed to update connector.'); }
  };

  const handleAddIcpRule = () => {
    setIcpRules(prev => [...prev, { category: '', conditions: [], isEditing: true, isSaving: false }]);
  };

  const handleSaveIcpRule = async (idx: number) => {
    const draft = icpRules[idx];
    if (!draft.category || draft.conditions.length === 0) { toast.error('Select a category and at least one option.'); return; }
    setIcpRules(prev => prev.map((r, i) => i === idx ? { ...r, isSaving: true } : r));
    try {
      if (draft.id) {
        await fetch(`/api/admin/icp-rules/${draft.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: draft.category, conditions: draft.conditions }) });
        setIcpRules(prev => prev.map((r, i) => i === idx ? { ...r, isEditing: false, isSaving: false } : r));
      } else {
        const res = await fetch('/api/admin/icp-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: draft.category, conditions: draft.conditions }) });
        const saved = await res.json() as { id: number };
        setIcpRules(prev => prev.map((r, i) => i === idx ? { ...r, id: saved.id, isEditing: false, isSaving: false } : r));
      }
      toast.success('ICP parameter saved!');
    } catch { toast.error('Failed to save ICP parameter.'); setIcpRules(prev => prev.map((r, i) => i === idx ? { ...r, isSaving: false } : r)); }
  };

  const handleDeleteIcpRule = async (idx: number) => {
    const draft = icpRules[idx];
    if (!draft.id) { setIcpRules(prev => prev.filter((_, i) => i !== idx)); return; }
    try {
      await fetch(`/api/admin/icp-rules/${draft.id}`, { method: 'DELETE' });
      setIcpRules(prev => prev.filter((_, i) => i !== idx));
      toast.success('ICP parameter deleted.');
    } catch { toast.error('Failed to delete ICP parameter.'); }
  };

  // ── Edit Tables tab ──────────────────────────────────────────────────────────

  const fetchTableConfig = async () => {
    setLoadingTables(true);
    try {
      const res = await fetch('/api/admin/table-config');
      if (!res.ok) throw new Error();
      const data = await res.json() as Record<string, Record<string, { visible: boolean; sort_order: number | null }>>;
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

  const toggleSectionPageExpanded = (page: string) => {
    setExpandedSectionPages(prev => {
      const next = new Set(prev);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      return next;
    });
  };

  const handleColumnToggle = async (tableName: string, columnKey: string, visible: boolean) => {
    const saveKey = `${tableName}:${columnKey}`;
    setSavingCol(saveKey);
    setTableConfig(prev => ({
      ...prev,
      [tableName]: { ...(prev[tableName] ?? {}), [columnKey]: { ...(prev[tableName]?.[columnKey] ?? { sort_order: null }), visible } },
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
      setTableConfig(prev => ({
        ...prev,
        [tableName]: { ...(prev[tableName] ?? {}), [columnKey]: { ...(prev[tableName]?.[columnKey] ?? { sort_order: null }), visible: !visible } },
      }));
    } finally { setSavingCol(null); }
  };

  const isColVisible = (tableName: string, columnKey: string): boolean => {
    const tbl = tableConfig[tableName];
    if (!tbl || !(columnKey in tbl)) return true;
    return tbl[columnKey].visible;
  };

  const getOrderedCols = (tableName: string) => {
    const defs = TABLE_COLUMN_DEFS[tableName] ?? [];
    const tbl = tableConfig[tableName] ?? {};
    return [...defs].sort((a, b) => {
      const ia = defs.findIndex(d => d.key === a.key);
      const ib = defs.findIndex(d => d.key === b.key);
      const oa = tbl[a.key]?.sort_order ?? ia;
      const ob = tbl[b.key]?.sort_order ?? ib;
      return oa - ob;
    });
  };

  const handleColumnReorder = async (tableName: string, fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    const ordered = getOrderedCols(tableName);
    const fromIdx = ordered.findIndex(c => c.key === fromKey);
    const toIdx   = ordered.findIndex(c => c.key === toKey);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = [...ordered];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    const orders = next.map((col, i) => ({ column: col.key, sort_order: i }));
    // Optimistic update
    setTableConfig(prev => {
      const updated = { ...(prev[tableName] ?? {}) };
      orders.forEach(({ column, sort_order }) => {
        updated[column] = { ...(updated[column] ?? { visible: true }), sort_order };
      });
      return { ...prev, [tableName]: updated };
    });
    try {
      const res = await fetch('/api/admin/table-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: tableName, orders }),
      });
      if (!res.ok) throw new Error();
      invalidateTableColumnConfig(tableName);
    } catch {
      toast.error('Failed to save column order.');
    }
  };

  // ── Custom columns ────────────────────────────────────────────────────────────

  const loadCustomCols = async (tableName: string) => {
    try {
      const res = await fetch(`/api/admin/custom-columns?table=${tableName}`);
      if (!res.ok) throw new Error();
      const data: CustomColumnDef[] = await res.json();
      setCustomCols(prev => ({ ...prev, [tableName]: data }));
    } catch { toast.error('Failed to load custom columns.'); }
  };

  const handleCustomColToggle = async (id: number, tableName: string, visible: boolean) => {
    setCustomCols(prev => ({
      ...prev,
      [tableName]: (prev[tableName] ?? []).map(c => c.id === id ? { ...c, visible } : c),
    }));
    try {
      const res = await fetch(`/api/admin/custom-columns/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible }),
      });
      if (!res.ok) throw new Error();
      invalidateCustomColumns(tableName);
    } catch {
      toast.error('Failed to update custom column.');
      setCustomCols(prev => ({
        ...prev,
        [tableName]: (prev[tableName] ?? []).map(c => c.id === id ? { ...c, visible: !visible } : c),
      }));
    }
  };

  const handleDeleteCustomCol = async (id: number, tableName: string) => {
    if (!confirm('Remove this custom column? This cannot be undone.')) return;
    setCustomCols(prev => ({ ...prev, [tableName]: (prev[tableName] ?? []).filter(c => c.id !== id) }));
    try {
      const res = await fetch(`/api/admin/custom-columns/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      invalidateCustomColumns(tableName);
    } catch { toast.error('Failed to remove custom column.'); loadCustomCols(tableName); }
  };

  const handleAddCustomCol = async (tableName: string, col: Omit<CustomColumnDef, 'id' | 'table_name' | 'sort_order' | 'visible'>) => {
    try {
      const res = await fetch('/api/admin/custom-columns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_name: tableName, ...col }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const created: CustomColumnDef = await res.json();
      setCustomCols(prev => ({ ...prev, [tableName]: [...(prev[tableName] ?? []), created] }));
      invalidateCustomColumns(tableName);
      setAddColTable(null);
      toast.success('Column added.');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to add column.'); }
  };

  // ── Mobile long-press drag for Edit Tables ───────────────────────────────────

  useEffect(() => () => { if (_longPressTimer.current) clearTimeout(_longPressTimer.current); }, []);

  const startMobileDrag = (tableName: string, colKey: string) => {
    _mDragFrom.current = { table: tableName, key: colKey };
    _mDragOver.current = null;
    _mActivated.current = true;
    setMobileDragFrom({ table: tableName, key: colKey });
    setMobileDragOver(null);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);

    const move = (e: TouchEvent) => {
      if (!_mActivated.current) return;
      e.preventDefault();
      const touch = e.touches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const row = el?.closest('[data-col-key]') as HTMLElement | null;
      const newOver = row?.dataset.tableName === _mDragFrom.current?.table ? (row?.dataset.colKey ?? null) : null;
      if (newOver !== _mDragOver.current) {
        _mDragOver.current = newOver;
        setMobileDragOver(newOver);
      }
    };
    const end = () => {
      const from = _mDragFrom.current;
      const to = _mDragOver.current;
      if (from && to && to !== from.key) handleColumnReorder(from.table, from.key, to);
      _mActivated.current = false;
      _mDragFrom.current = null;
      _mDragOver.current = null;
      setMobileDragFrom(null);
      setMobileDragOver(null);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', end);
    };
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
  };

  const handleGripTouchStart = (tableName: string, colKey: string) => (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    if (_longPressTimer.current) clearTimeout(_longPressTimer.current);
    _longPressTimer.current = setTimeout(() => {
      startMobileDrag(tableName, colKey);
      _longPressTimer.current = null;
    }, 500);
  };

  const cancelLongPress = () => {
    if (_longPressTimer.current) { clearTimeout(_longPressTimer.current); _longPressTimer.current = null; }
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
      const lw = data['logo_white_url'] ?? '';
      const ld = data['logo_dark_url'] ?? '';
      const fav = data['favicon_url'] ?? '';
      const ls = data['logo_sidebar_url'] ?? '';
      setSavedLogoWhite(lw); setLogoWhiteInput(lw);
      setSavedLogoDark(ld); setLogoDarkInput(ld);
      setSavedFavicon(fav); setFaviconInput(fav);
      setSavedLogoSidebar(ls); setLogoSidebarInput(ls);
      const fk = data['font_key'] ?? DEFAULT_FONT_KEY;
      setFontKey(fk); setSavedFontKey(fk);
      const tl = data['tagline'] ?? '';
      setTaglineInput(tl); setSavedTagline(tl);
    } catch { toast.error('Failed to load brand colors.'); }
    finally { setLoadingBrand(false); }
  };

  const handleSaveFont = async () => {
    setSavingFont(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'font_key', value: fontKey }),
      });
      if (!res.ok) throw new Error();
      setSavedFontKey(fontKey);
      toast.success('Font saved. Reload the page to see the change.');
    } catch { toast.error('Failed to save font.'); }
    finally { setSavingFont(false); }
  };

  const handleSaveTagline = async () => {
    setSavingTagline(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'tagline', value: taglineInput.trim() }),
      });
      if (!res.ok) throw new Error();
      setSavedTagline(taglineInput.trim());
      invalidateTagline();
      toast.success(taglineInput.trim() ? 'Tagline saved.' : 'Tagline reset to default.');
    } catch { toast.error('Failed to save tagline.'); }
    finally { setSavingTagline(false); }
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

  const handleSaveLogos = async () => {
    setSavingLogos(true);
    try {
      await Promise.all([
        fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'logo_white_url', value: logoWhiteInput.trim() }) }),
        fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'logo_dark_url', value: logoDarkInput.trim() }) }),
        fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'favicon_url', value: faviconInput.trim() }) }),
        fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'logo_sidebar_url', value: logoSidebarInput.trim() }) }),
      ]);
      setSavedLogoWhite(logoWhiteInput.trim());
      setSavedLogoDark(logoDarkInput.trim());
      setSavedFavicon(faviconInput.trim());
      setSavedLogoSidebar(logoSidebarInput.trim());
      invalidateLogoConfig();
      toast.success('Logo & favicon settings saved.');
    } catch { toast.error('Failed to save logo settings.'); }
    finally { setSavingLogos(false); }
  };

  const handleLogoUpload = async (setter: (v: string) => void, savedSetter: (v: string) => void, dbKey: string, file: File, fieldLabel: string) => {
    setUploadingLogo(fieldLabel);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/upload-logo', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || 'Upload failed');
      }
      const { url } = await res.json() as { url: string };
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: dbKey, value: url }),
      });
      setter(url);
      savedSetter(url);
      invalidateLogoConfig();
      toast.success(`${fieldLabel} updated.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingLogo(null);
    }
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

  // ── User Management tab ───────────────────────────────────────────────────────

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) throw new Error();
      setUsersList(await res.json());
    } catch { toast.error('Failed to load users.'); }
    finally { setUsersLoading(false); }
  };

  useEffect(() => { if (tab === 'users') fetchUsers(); }, [tab]);

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteSending(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm),
      });
      const data = await res.json() as { error?: string; devInviteLink?: string };
      if (!res.ok) { toast.error(data.error ?? 'Failed to send invite.'); return; }
      toast.success(`Invite sent to ${inviteForm.email}.`);
      if (data.devInviteLink) {
        console.log('DEV invite link:', data.devInviteLink);
        toast(`DEV link logged to console`, { icon: '🔗' });
      }
      setInviteForm({ firstName: '', lastName: '', email: '', role: 'user' });
      fetchUsers();
    } catch { toast.error('Network error.'); }
    finally { setInviteSending(false); }
  };

  const handleRoleChange = async (userId: number, role: 'user' | 'administrator') => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error();
      setUsersList(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
      toast.success('Role updated.');
    } catch { toast.error('Failed to update role.'); }
  };

  const handleToggleActive = async (userId: number, active: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw new Error();
      setUsersList(prev => prev.map(u => u.id === userId ? { ...u, active } : u));
      toast.success(active ? 'Access restored.' : 'Access suspended.');
    } catch { toast.error('Failed to update access.'); }
  };

  const handleResendInvite = async (userId: number) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resendInvite: true }),
      });
      const data = await res.json() as { error?: string; devInviteLink?: string };
      if (!res.ok) { toast.error(data.error ?? 'Failed to resend.'); return; }
      toast.success('Invite resent.');
      if (data.devInviteLink) { console.log('DEV invite link:', data.devInviteLink); toast(`DEV link logged to console`, { icon: '🔗' }); }
    } catch { toast.error('Network error.'); }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal || !reassignToId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${deleteModal.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reassignToUserId: reassignToId }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { toast.error(data.error ?? 'Failed to delete.'); return; }
      toast.success(`${deleteModal.displayName ?? deleteModal.email} deleted and records reassigned.`);
      setDeleteModal(null);
      setReassignToId('');
      fetchUsers();
    } catch { toast.error('Network error.'); }
    finally { setDeleting(false); }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <BackButton />
      <div>
        <h1 className="text-2xl font-bold text-brand-primary font-serif">Admin Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage dropdown options, table column visibility, and user permissions.</p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="flex gap-1 sm:gap-6 whitespace-nowrap">
          {(['types', 'tables', 'sections', 'brand', 'permissions', 'icp', 'forms', 'users', 'email-templates', 'integrations', 'effectiveness'] as Tab[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`py-3 px-2 sm:px-1 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${tab === t ? 'border-brand-secondary text-brand-secondary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t === 'types' ? 'Types' : t === 'tables' ? 'Edit Tables' : t === 'sections' ? 'Section Management' : t === 'brand' ? 'Brand' : t === 'permissions' ? 'Permissions' : t === 'icp' ? 'ICP' : t === 'forms' ? 'Custom Forms' : t === 'users' ? 'User Management' : t === 'email-templates' ? 'Email Templates' : t === 'effectiveness' ? 'Effectiveness Defaults' : 'Integrations'}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Types tab ── */}
      {tab === 'types' && (
        isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Unit Type field */}
            <div className="card">
              <h2 className="text-base font-semibold text-brand-primary font-serif mb-1">Unit Type</h2>
              <p className="text-sm text-gray-500 mb-4">Define the global unit used to measure the size of a prospect (e.g. WSE, beds, units).</p>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600 flex-shrink-0">Unit Type =</span>
                <input
                  type="text"
                  value={unitTypeLabel}
                  onChange={e => setUnitTypeLabel(e.target.value)}
                  className="input-field text-sm flex-1 max-w-xs"
                  placeholder="e.g. WSE"
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveUnitType(); }}
                />
                <button
                  type="button"
                  onClick={handleSaveUnitType}
                  disabled={unitTypeSaving || !unitTypeLabel.trim()}
                  className="btn-primary text-sm flex-shrink-0"
                >
                  {unitTypeSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {CATEGORIES.map(cat => (
                <CategorySection key={cat.key} category={cat.key} label={cat.label} options={optionsByCategory[cat.key] || []} onRefresh={fetchAll} />
              ))}
            </div>
          </div>
        )
      )}

      {/* ── Edit Tables tab ── */}
      {tab === 'tables' && (
        loadingTables ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-gray-500">Toggle columns on or off for each table. Changes take effect immediately for all users.</p>
            {Object.keys(TABLE_COLUMN_DEFS).map(tableName => {
              const isExpanded = expandedTables.has(tableName);
              const orderedCols = getOrderedCols(tableName);
              return (
                <div key={tableName} className="card p-0 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedTables(prev => {
                      const next = new Set(prev);
                      if (next.has(tableName)) { next.delete(tableName); } else { next.add(tableName); loadCustomCols(tableName); }
                      return next;
                    })}
                    className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <h2 className="text-base font-semibold text-brand-primary font-serif">
                      {TABLE_LABELS[tableName] ?? tableName}
                    </h2>
                    <svg
                      className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isExpanded && (
                    <div className="divide-y divide-gray-100 border-t border-gray-100 px-6 pb-2">
                      {orderedCols.map(col => {

                        const visible = isColVisible(tableName, col.key);
                        const saveKey = `${tableName}:${col.key}`;
                        const isDragTarget = dragCol?.table === tableName && dragOverKey === col.key && dragCol.key !== col.key;
                        const isMobileDragTarget = mobileDragOver === col.key && mobileDragFrom?.table === tableName && mobileDragFrom.key !== col.key;
                        const isMobileDragSource = mobileDragFrom?.table === tableName && mobileDragFrom.key === col.key;
                        return (
                          <div
                            key={col.key}
                            data-col-key={col.key}
                            data-table-name={tableName}
                            draggable
                            onDragStart={() => setDragCol({ table: tableName, key: col.key })}
                            onDragEnd={() => { setDragCol(null); setDragOverKey(null); }}
                            onDragOver={e => { e.preventDefault(); if (dragCol?.table === tableName) setDragOverKey(col.key); }}
                            onDragLeave={() => setDragOverKey(null)}
                            onDrop={e => {
                              e.preventDefault();
                              if (dragCol?.table === tableName) handleColumnReorder(tableName, dragCol.key, col.key);
                              setDragCol(null); setDragOverKey(null);
                            }}
                            className={`flex items-center justify-between py-3 transition-colors rounded ${isDragTarget || isMobileDragTarget ? 'bg-blue-50 outline outline-2 outline-brand-secondary' : ''} ${isMobileDragSource ? 'opacity-40' : ''}`}
                          >
                            <div className="flex items-center gap-3">
                              <svg
                                className="w-4 h-4 text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                onTouchStart={handleGripTouchStart(tableName, col.key)}
                                onTouchMove={cancelLongPress}
                                onTouchEnd={cancelLongPress}
                                onTouchCancel={cancelLongPress}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                              </svg>
                              <span className="text-sm text-gray-700">{col.label}</span>
                            </div>
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

                      {/* Custom columns */}
                      {(customCols[tableName] ?? []).map(col => (
                        <div key={col.id} className="flex items-center justify-between py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-semibold text-brand-secondary uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-50 border border-blue-100 flex-shrink-0">Custom</span>
                            <span className="text-sm text-gray-700">{col.label}</span>
                            <span className="text-xs text-gray-400">{DISPLAY_TYPE_LABELS[col.display_type]}</span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => handleDeleteCustomCol(col.id, tableName)}
                              className="text-xs text-red-400 hover:text-red-600 transition-colors"
                              title="Remove column"
                            >
                              Remove
                            </button>
                            <Toggle
                              checked={col.visible}
                              onChange={v => handleCustomColToggle(col.id, tableName, v)}
                            />
                          </div>
                        </div>
                      ))}

                      {/* Add Column button */}
                      {AVAILABLE_COLUMNS[tableName]?.length > 0 && (
                        <div className="py-3">
                          <button
                            type="button"
                            onClick={() => setAddColTable(tableName)}
                            className="flex items-center gap-1.5 text-sm text-brand-secondary hover:text-brand-primary font-medium transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Column
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Add Column Modal */}
      {addColTable && (
        <AddColumnModal
          tableName={addColTable}
          existingKeys={(customCols[addColTable] ?? []).map(c => c.column_key)}
          onClose={() => setAddColTable(null)}
          onAdd={col => handleAddCustomCol(addColTable, col)}
        />
      )}

      {/* ── Section Management tab ── */}
      {tab === 'sections' && (
        loadingSections ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-gray-500">Customize the title, order, and visibility of sections on Attendee and Company detail pages, plus the tab order/visibility on Conference Details pages. Changes take effect immediately for all users.</p>
            {Object.entries(SECTION_DEFS).map(([page]) => {
              const sections = sectionConfig[page] ?? [];
              const isExpanded = expandedSectionPages.has(page);
              return (
                <div key={page} className="card">
                  <button
                    type="button"
                    onClick={() => toggleSectionPageExpanded(page)}
                    className="w-full flex items-center justify-between gap-3 text-left"
                  >
                    <h2 className="text-base font-semibold text-brand-primary font-serif">
                      {SECTION_PAGE_LABELS[page] ?? page}
                    </h2>
                    <svg
                      className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isExpanded && (
                    <div className="divide-y divide-gray-100 border-t border-gray-100 mt-4">
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
                                className="p-0.5 text-gray-400 hover:text-brand-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Move up"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => moveSectionItem(page, index, 1)}
                                disabled={index === sections.length - 1 || savingSections === page}
                                className="p-0.5 text-gray-400 hover:text-brand-secondary disabled:opacity-30 disabled:cursor-not-allowed"
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
                                    className="text-brand-secondary hover:text-brand-primary text-xs font-medium"
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
                  )}
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
            <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full" />
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
                <h3 className="text-brand-primary font-serif font-semibold text-lg leading-none">Heading</h3>
                <button type="button" className="btn-primary text-xs py-1.5 px-3 pointer-events-none">Primary Button</button>
                <button type="button" className="btn-secondary text-xs py-1.5 px-3 pointer-events-none">Secondary Button</button>
                <button type="button" className="btn-gold text-xs py-1.5 px-3 pointer-events-none">Gold Button</button>
                <span className="text-brand-secondary text-sm font-medium">Link text</span>
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-brand-secondary/10 text-brand-secondary">Badge</span>
                <div className="flex gap-1.5">
                  {(Object.keys(BRAND_COLOR_DEFAULTS) as BrandColorKey[]).map(key => (
                    <div key={key} className="w-5 h-5 rounded-full border border-white shadow-sm ring-1 ring-gray-200" style={{ backgroundColor: brandDraft[key] }} title={BRAND_COLOR_META[key].label} />
                  ))}
                </div>
              </div>
            </div>

            {/* App Name */}
            <div className="card">
              <h2 className="text-base font-semibold text-brand-primary font-serif mb-1">App Name</h2>
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

            {/* Tagline */}
            <div className="card">
              <h2 className="text-base font-semibold text-brand-primary font-serif mb-1">Sidebar Tagline</h2>
              <p className="text-sm text-gray-500 mb-4">Set the italic tagline shown beneath the logo in the sidebar. Leave blank to use the default: <span className="italic text-gray-600">&quot;Relationships Matter&quot;</span></p>
              <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                <input
                  type="text"
                  value={taglineInput}
                  onChange={e => setTaglineInput(e.target.value)}
                  placeholder="Relationships Matter"
                  className="input-field text-sm flex-1"
                  maxLength={80}
                />
                <button
                  type="button"
                  onClick={handleSaveTagline}
                  disabled={savingTagline || taglineInput.trim() === savedTagline}
                  className="btn-primary text-sm flex-shrink-0"
                >
                  {savingTagline ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>

            {/* Logos & Favicon */}
            <div className="card">
              <h2 className="text-base font-semibold text-brand-primary font-serif mb-1">Logos &amp; Favicon</h2>
              <p className="text-sm text-gray-500 mb-5">Upload image files or paste an external URL. PNG, JPG, WebP, SVG, and ICO supported (max 5 MB).</p>
              <div className="divide-y divide-gray-100">
                {([
                  { label: 'Sidebar Logo', dbKey: 'logo_sidebar_url', desc: 'Shown at the top of the sidebar, login, and signup. Falls back to White Logo if blank.', value: logoSidebarInput, set: setLogoSidebarInput, savedSet: setSavedLogoSidebar, accept: 'image/*' },
                  { label: 'White Logo', dbKey: 'logo_white_url', desc: 'Used on dark backgrounds as a fallback.', value: logoWhiteInput, set: setLogoWhiteInput, savedSet: setSavedLogoWhite, accept: 'image/*' },
                  { label: 'Dark Logo', dbKey: 'logo_dark_url', desc: 'Used on light backgrounds.', value: logoDarkInput, set: setLogoDarkInput, savedSet: setSavedLogoDark, accept: 'image/*' },
                  { label: 'Favicon', dbKey: 'favicon_url', desc: 'Shown in the browser tab.', value: faviconInput, set: setFaviconInput, savedSet: setSavedFavicon, accept: 'image/x-icon,image/vnd.microsoft.icon,image/png,image/svg+xml' },
                ] as { label: string; dbKey: string; desc: string; value: string; set: (v: string) => void; savedSet: (v: string) => void; accept: string }[]).map(({ label, dbKey, desc, value, set, savedSet, accept }) => (
                  <div key={label} className="py-4 flex items-center gap-4">
                    {/* Preview */}
                    <div className="w-14 h-14 rounded-lg border border-gray-200 overflow-hidden flex-shrink-0 bg-gray-800 flex items-center justify-center">
                      {value ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={value} alt={label} className="max-w-full max-h-full object-contain p-1" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      )}
                    </div>
                    {/* Controls */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 mb-0.5">{label}</p>
                      <p className="text-xs text-gray-400 mb-2">{desc}</p>
                      <div className="flex items-center gap-2">
                        <label className={`cursor-pointer flex-shrink-0 ${uploadingLogo !== null ? 'opacity-50 pointer-events-none' : ''}`}>
                          <input
                            type="file"
                            accept={accept}
                            className="hidden"
                            onChange={e => {
                              const f = e.target.files?.[0];
                              if (f) handleLogoUpload(set, savedSet, dbKey, f, label);
                              e.target.value = '';
                            }}
                            disabled={uploadingLogo !== null}
                          />
                          <span className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1.5">
                            {uploadingLogo === label ? (
                              <>
                                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                                Uploading…
                              </>
                            ) : (
                              <>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                Upload
                              </>
                            )}
                          </span>
                        </label>
                        <input
                          type="url"
                          value={value}
                          onChange={e => set(e.target.value)}
                          placeholder="or paste URL…"
                          className="input-field text-xs flex-1 font-mono"
                        />
                        {value && (
                          <button type="button" onClick={() => set('')} className="flex-shrink-0 text-gray-300 hover:text-red-400 transition-colors" title="Clear">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-5 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleSaveLogos}
                  disabled={savingLogos || uploadingLogo !== null || (logoSidebarInput.trim() === savedLogoSidebar && logoWhiteInput.trim() === savedLogoWhite && logoDarkInput.trim() === savedLogoDark && faviconInput.trim() === savedFavicon)}
                  className="btn-primary text-sm"
                >
                  {savingLogos ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>

            {/* Color pickers */}
            <div className="card">
              <h2 className="text-base font-semibold text-brand-primary font-serif mb-1">Brand Colors</h2>
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
                          className="w-24 px-2 py-1.5 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-secondary"
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
                            className="w-9 h-9 rounded-lg border-2 border-gray-200 hover:border-brand-secondary transition-colors"
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

            {/* Typography */}
            <div className="card">
              <h2 className="text-base font-semibold text-brand-primary font-serif mb-1">Typography</h2>
              <p className="text-sm text-gray-500 mb-5">Choose a font pairing for headings and body text. Changes take effect after the page reloads.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
                {FONT_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setFontKey(opt.key)}
                    className={`text-left p-4 rounded-xl border-2 transition-colors ${
                      fontKey === opt.key
                        ? 'border-brand-secondary bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{opt.label}</span>
                      {fontKey === opt.key && (
                        <span className="text-[10px] font-semibold text-brand-secondary uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-50 border border-blue-100">Selected</span>
                      )}
                    </div>
                    <p className="text-base font-bold text-gray-800 leading-tight mb-1" style={{ fontFamily: opt.headingFamily }}>
                      Heading Style
                    </p>
                    <p className="text-xs text-gray-500 leading-relaxed" style={{ fontFamily: opt.bodyFamily }}>
                      Body text — clear and readable for data-dense screens.
                    </p>
                    <p className="text-[10px] text-gray-400 mt-2">{opt.previewHeading} / {opt.previewBody}</p>
                  </button>
                ))}
              </div>
              <div className="flex justify-end pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleSaveFont}
                  disabled={savingFont || fontKey === savedFontKey}
                  className="btn-primary text-sm"
                >
                  {savingFont ? 'Saving…' : 'Save Font'}
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
            <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="card">
              <h2 className="text-base font-semibold text-brand-primary font-serif mb-1">Conference Attendee List Upload</h2>
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

          </div>
        )
      )}

      {/* ── ICP tab ── */}
      {tab === 'icp' && (
        icpLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Unit Type requirement row */}
            <div className="card">
              <h2 className="text-base font-semibold text-brand-primary font-serif mb-1">{unitTypeLabel || 'Unit Type'} Requirement</h2>
              <p className="text-sm text-gray-500 mb-4">Set a numeric threshold for the {unitTypeLabel || 'unit type'} value. Prospects that don&apos;t meet this requirement will not be marked as ICP.</p>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-gray-700 flex-shrink-0">{unitTypeLabel || 'Unit Type'}</span>
                <select
                  value={icpUnitTypeOp}
                  onChange={e => setIcpUnitTypeOp(e.target.value as IcpUnitTypeOperator | '')}
                  className="input-field text-sm w-36"
                >
                  <option value="">— no requirement —</option>
                  {(Object.entries(ICP_OPERATOR_LABELS) as [IcpUnitTypeOperator, string][]).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
                {icpUnitTypeOp && icpUnitTypeOp !== 'between' && (
                  <input
                    type="number"
                    value={icpUnitTypeV1}
                    onChange={e => setIcpUnitTypeV1(e.target.value)}
                    className="input-field text-sm w-28"
                    placeholder="value"
                    min={0}
                  />
                )}
                {icpUnitTypeOp === 'between' && (
                  <>
                    <input
                      type="number"
                      value={icpUnitTypeV1}
                      onChange={e => setIcpUnitTypeV1(e.target.value)}
                      className="input-field text-sm w-28"
                      placeholder="min"
                      min={0}
                    />
                    <span className="text-sm text-gray-500">and</span>
                    <input
                      type="number"
                      value={icpUnitTypeV2}
                      onChange={e => setIcpUnitTypeV2(e.target.value)}
                      className="input-field text-sm w-28"
                      placeholder="max"
                      min={0}
                    />
                  </>
                )}
                <button
                  type="button"
                  onClick={handleSaveIcpUnitType}
                  disabled={icpUnitTypeSaving || !icpUnitTypeOp}
                  className="btn-primary text-sm flex-shrink-0"
                >
                  {icpUnitTypeSaving ? 'Saving…' : 'Save'}
                </button>
                {icpUnitTypeOp && (
                  <button
                    type="button"
                    onClick={handleClearIcpUnitType}
                    disabled={icpUnitTypeSaving}
                    className="btn-secondary text-sm flex-shrink-0"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Connector between WSE and ICP Parameters */}
            <div className="flex items-center gap-3 justify-center py-1">
              <div className="h-px flex-1 bg-gray-200" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Combined with</span>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => handleToggleConnector('AND')}
                    className={icpUnitTypeConnector === 'AND'
                      ? 'px-3 py-1 bg-brand-secondary text-white'
                      : 'px-3 py-1 bg-white text-gray-500 hover:bg-gray-50'}
                  >AND</button>
                  <button
                    type="button"
                    onClick={() => handleToggleConnector('OR')}
                    className={icpUnitTypeConnector === 'OR'
                      ? 'px-3 py-1 bg-brand-secondary text-white'
                      : 'px-3 py-1 bg-white text-gray-500 hover:bg-gray-50'}
                  >OR</button>
                </div>
                <span className="text-xs text-gray-400 uppercase tracking-wide">ICP Parameters</span>
              </div>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            {/* Category rules */}
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-brand-primary font-serif">ICP Parameters</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Each parameter must pass for a company to be marked as ICP. Within a parameter, AND conditions all must match; OR conditions at least one must match.</p>
                </div>
              </div>

              {icpRules.length === 0 && (
                <p className="text-sm text-gray-400 py-2">No ICP parameters configured yet. Add one below.</p>
              )}

              {icpRules.map((rule, idx) => {
                const categoryOptions = optionsByCategory[rule.category] ?? [];
                return (
                  <div key={rule.id ?? `new-${idx}`} className={`rounded-lg border p-4 space-y-3 ${rule.isEditing ? 'border-brand-secondary bg-blue-50/30' : 'border-gray-200'}`}>
                    {rule.isEditing ? (
                      <>
                        {/* Category selector */}
                        <div className="flex flex-wrap items-center gap-3">
                          <select
                            value={rule.category}
                            onChange={e => setIcpRules(prev => prev.map((r, i) => i === idx ? { ...r, category: e.target.value, conditions: [] } : r))}
                            className="input-field text-sm w-52"
                          >
                            <option value="">— select category —</option>
                            {ICP_RULE_CATEGORIES.map(c => (
                              <option key={c.key} value={c.key}>{c.label}</option>
                            ))}
                          </select>
                          <span className="text-sm text-gray-500">must match:</span>
                        </div>

                        {/* Options list with AND/OR toggles */}
                        {rule.category && categoryOptions.length === 0 && (
                          <p className="text-xs text-gray-400">No options configured for this category yet.</p>
                        )}
                        {rule.category && categoryOptions.length > 0 && (
                          <div className="space-y-2 pl-2">
                            {categoryOptions.map(opt => {
                              const existing = rule.conditions.find(c => c.option_value === opt.value);
                              return (
                                <div key={opt.id} className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    id={`icp-opt-${idx}-${opt.id}`}
                                    className="accent-brand-secondary"
                                    checked={!!existing}
                                    onChange={e => {
                                      if (e.target.checked) {
                                        setIcpRules(prev => prev.map((r, i) => i === idx ? { ...r, conditions: [...r.conditions, { option_value: opt.value, operator: 'OR' }] } : r));
                                      } else {
                                        setIcpRules(prev => prev.map((r, i) => i === idx ? { ...r, conditions: r.conditions.filter(c => c.option_value !== opt.value) } : r));
                                      }
                                    }}
                                  />
                                  <label htmlFor={`icp-opt-${idx}-${opt.id}`} className="text-sm text-gray-700 flex-1">{opt.value}</label>
                                  {existing && (
                                    <div className="inline-flex items-center rounded-lg border border-gray-200 p-0.5 bg-white">
                                      {(['AND', 'OR'] as const).map(op => (
                                        <button
                                          key={op}
                                          type="button"
                                          onClick={() => setIcpRules(prev => prev.map((r, i) => i === idx ? { ...r, conditions: r.conditions.map(c => c.option_value === opt.value ? { ...c, operator: op } : c) } : r))}
                                          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${existing.operator === op ? 'bg-brand-secondary text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                          {op}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleSaveIcpRule(idx)}
                            disabled={rule.isSaving}
                            className="btn-primary text-xs px-3 py-1.5"
                          >
                            {rule.isSaving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (rule.id) {
                                setIcpRules(prev => prev.map((r, i) => i === idx ? { ...r, isEditing: false } : r));
                              } else {
                                setIcpRules(prev => prev.filter((_, i) => i !== idx));
                              }
                            }}
                            className="btn-secondary text-xs px-3 py-1.5"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteIcpRule(idx)}
                            className="text-red-400 hover:text-red-600 text-xs font-medium px-2 py-1.5 ml-auto"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    ) : (
                      /* Read-only view */
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">
                            {ICP_RULE_CATEGORIES.find(c => c.key === rule.category)?.label ?? rule.category}
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {rule.conditions.map((c, ci) => (
                              <span key={ci} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                <span className={`text-[10px] font-bold ${c.operator === 'AND' ? 'text-blue-600' : 'text-green-600'}`}>{c.operator}</span>
                                {c.option_value}
                              </span>
                            ))}
                            {rule.conditions.length === 0 && <span className="text-xs text-gray-400">No conditions</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => setIcpRules(prev => prev.map((r, i) => i === idx ? { ...r, isEditing: true } : r))}
                            className="text-brand-secondary hover:text-brand-primary text-xs font-medium px-2 py-1"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteIcpRule(idx)}
                            className="text-red-400 hover:text-red-600 text-xs font-medium px-2 py-1"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={handleAddIcpRule}
                className="btn-secondary text-sm w-full"
              >
                + ICP Parameter
              </button>
            </div>

          {/* ── Card: Ideal Buyer Persona ── */}
          <div className="card">
            <h2 className="text-base font-semibold text-brand-primary font-serif mb-1">Ideal Buyer Persona</h2>
            <p className="text-sm text-gray-500 mb-4">Define who you&apos;re trying to reach at ICP companies. Used by Parlay to identify the right contacts to prioritize at each conference — not just the right companies.</p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Titles</label>
              <TagInput tags={icpTargetTitles} onChange={setIcpTargetTitles} placeholder="Add a job title…" />
              <p className="text-xs text-gray-400 mt-1">Job titles that indicate a strong prospect contact.</p>
            </div>

            <div className="border-t border-gray-100 my-4" />

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Seniority Priority and Product Mapping</label>
              <p className="text-xs text-gray-400 mb-2">Set the priority for each seniority tier and map products to contact functions. Contacts with High or Medium priority whose function has a mapped product will be auto-assigned that product on upload.</p>
              <div className="grid grid-cols-2 gap-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-100">
                      <th className="text-left pb-1 font-medium">Seniority Level</th>
                      <th className="text-left pb-1 font-medium">Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(optionsByCategory['seniority'] ?? []).map(s => (
                      <tr key={s.value} className="border-b border-gray-50">
                        <td className="py-1.5 pr-4">{s.value}</td>
                        <td className="py-1.5">
                          <select
                            value={icpSeniorityPriority[s.value] ?? 'Medium'}
                            onChange={e => setIcpSeniorityPriority(prev => ({ ...prev, [s.value]: e.target.value as 'High' | 'Medium' | 'Low' | 'Ignore' }))}
                            className="input-field text-sm py-0.5"
                          >
                            {(['High', 'Medium', 'Low', 'Ignore'] as const).map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-100">
                      <th className="text-left pb-1 font-medium">Function</th>
                      <th className="text-left pb-1 font-medium">Product</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(optionsByCategory['function'] ?? []).map(f => {
                      const selected = icpFunctionProductMapping[f.value] ?? [];
                      const productOpts = optionsByCategory['products'] ?? [];
                      return (
                        <tr key={f.value} className="border-b border-gray-50">
                          <td className="py-1.5 pr-4">{f.value}</td>
                          <td className="py-1.5">
                            <MultiSelectDropdown
                              options={productOpts.map(p => p.value)}
                              selected={selected}
                              onChange={vals => setIcpFunctionProductMapping(prev => ({ ...prev, [f.value]: vals }))}
                              placeholder="None"
                            />
                          </td>
                        </tr>
                      );
                    })}
                    {(optionsByCategory['function'] ?? []).length === 0 && (
                      <tr><td colSpan={2} className="py-2 text-xs text-gray-400">No function options configured.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border-t border-gray-100 my-4" />

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Decision Maker vs. Influencer Titles</label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">Decision Makers</p>
                  <TagInput tags={icpDecisionMakerTitles} onChange={setIcpDecisionMakerTitles} placeholder="Add a title…" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">Influencers</p>
                  <TagInput tags={icpInfluencerTitles} onChange={setIcpInfluencerTitles} placeholder="Add a title…" />
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-5 pt-4 border-t border-gray-100">
              <button className="btn-primary text-sm" onClick={handleSaveBuyerPersona} disabled={savingBuyerPersona}>
                {savingBuyerPersona ? 'Saving…' : 'Save Buyer Persona'}
              </button>
            </div>
          </div>

          {/* ── Card: Pain Points & Trigger Events ── */}
          <div className="card">
            <h2 className="text-base font-semibold text-brand-primary font-serif mb-1">Pain Points &amp; Trigger Events</h2>
            <p className="text-sm text-gray-500 mb-4">Tell Parlay what problems your best customers are solving and what signals indicate buying readiness.</p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Primary Pain Points</label>
              <TagInput tags={icpPainPoints} onChange={setIcpPainPoints} placeholder="Add a pain point…" />
              <p className="text-xs text-gray-400 mt-1">What operational or strategic problems does your product solve?</p>
            </div>

            <div className="border-t border-gray-100 my-4" />

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Trigger Events</label>
              <TagInput tags={icpTriggerEvents} onChange={setIcpTriggerEvents} placeholder="Add a trigger event…" />
              <p className="text-xs text-gray-400 mt-1">What signals indicate a company might be ready to buy? Parlay looks for these in conference context and company research.</p>
            </div>

            <div className="border-t border-gray-100 my-4" />

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">What We Are Not</label>
              <textarea
                value={icpExclusionDescription}
                onChange={e => setIcpExclusionDescription(e.target.value)}
                rows={3}
                className="input-field text-sm w-full"
                placeholder="e.g. We do not serve single-facility operators, CCRC-only organizations, or vendors."
              />
              <p className="text-xs text-gray-400 mt-1">Parlay uses this to filter out false positives in its recommendations.</p>
            </div>

            <div className="flex justify-end mt-5 pt-4 border-t border-gray-100">
              <button className="btn-primary text-sm" onClick={handleSavePainPoints} disabled={savingPainPoints}>
                {savingPainPoints ? 'Saving…' : 'Save Pain Points'}
              </button>
            </div>
          </div>

          {/* ── Card: Ideal Use Case Description ── */}
          <div className="card">
            <h2 className="text-base font-semibold text-brand-primary font-serif mb-1">Ideal Use Case Description</h2>
            <p className="text-sm text-gray-500 mb-4">A plain-language description of your best customer and why they bought. The single most important field for Parlay — gives the model a narrative template to match prospects against.</p>

            <textarea
              value={icpUseCaseDescription}
              onChange={e => setIcpUseCaseDescription(e.target.value)}
              className="input-field text-sm w-full"
              style={{ minHeight: '120px' }}
              placeholder="e.g. Our best customers are regional senior housing operators running 5–25 communities across multiple states…"
            />
            <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded-lg p-3 border border-gray-100">Write this like you&apos;re briefing a new sales rep before their first conference. The more specific and narrative, the more useful Parlay&apos;s recommendations will be.</p>

            <div className="flex justify-end mt-5 pt-4 border-t border-gray-100">
              <button className="btn-primary text-sm" onClick={handleSaveUseCase} disabled={savingUseCase}>
                {savingUseCase ? 'Saving…' : 'Save Use Case'}
              </button>
            </div>
          </div>

          {/* ── Card: Engagement Thresholds ── */}
          <div className="card">
            <h2 className="text-base font-semibold text-brand-primary font-serif mb-1">Engagement Thresholds</h2>
            <p className="text-sm text-gray-500 mb-4">Benchmarks Parlay uses when ranking prospects. Helps distinguish companies worth pursuing aggressively from those that need more nurturing.</p>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Active Pursuit Score</label>
                <input type="number" value={icpPursuitScore} onChange={e => setIcpPursuitScore(e.target.value)} className="input-field text-sm w-full" />
                <p className="text-xs text-gray-400 mt-1">Min health score before Parlay recommends direct outreach.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Warm Relationship Score</label>
                <input type="number" value={icpWarmScore} onChange={e => setIcpWarmScore(e.target.value)} className="input-field text-sm w-full" />
                <p className="text-xs text-gray-400 mt-1">Health score indicating a strong existing relationship.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Prior Touchpoints</label>
                <input type="number" value={icpMinTouchpoints} onChange={e => setIcpMinTouchpoints(e.target.value)} className="input-field text-sm w-full" />
                <p className="text-xs text-gray-400 mt-1">Touchpoints needed before Parlay suggests active pursuit.</p>
              </div>
            </div>

            <div className="border-t border-gray-100 my-4" />

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Include Companies With No Prior History</p>
                <p className="text-xs text-gray-400 mt-0.5">When enabled, Parlay will recommend net-new ICP companies even if your team has never engaged with them before.</p>
              </div>
              <Toggle checked={icpIncludeNewCompanies} onChange={setIcpIncludeNewCompanies} />
            </div>

            <div className="flex justify-end mt-5 pt-4 border-t border-gray-100">
              <button className="btn-primary text-sm" onClick={handleSaveThresholds} disabled={savingThresholds}>
                {savingThresholds ? 'Saving…' : 'Save Thresholds'}
              </button>
            </div>
          </div>
          </div>
        )
      )}

      {/* ── Custom Forms tab ── */}
      {tab === 'forms' && <AdminFormsTab />}

      {/* ── Email Templates tab ── */}
      {tab === 'email-templates' && <AdminEmailTemplatesTab />}

      {/* ── Integrations tab ── */}
      {tab === 'integrations' && <AdminIntegrationsTab />}

      {/* ── Effectiveness Defaults tab ── */}
      {tab === 'effectiveness' && <AdminEffectivenessTab />}

      {/* ── User Management tab ── */}
      {tab === 'users' && (
        <div className="space-y-6">
          {/* Invite New User */}
          <div className="card">
            <h2 className="text-base font-semibold text-brand-primary font-serif mb-1">Invite New User</h2>
            <p className="text-sm text-gray-500 mb-4">Send an invitation email to a new team member. They will set their own password.</p>
            <form onSubmit={handleInviteSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">First Name</label>
                <input
                  type="text"
                  value={inviteForm.firstName}
                  onChange={e => setInviteForm(f => ({ ...f, firstName: e.target.value }))}
                  required
                  className="input-field w-full text-sm"
                  placeholder="Jane"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Last Name</label>
                <input
                  type="text"
                  value={inviteForm.lastName}
                  onChange={e => setInviteForm(f => ({ ...f, lastName: e.target.value }))}
                  required
                  className="input-field w-full text-sm"
                  placeholder="Smith"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Email</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                  required
                  className="input-field w-full text-sm"
                  placeholder="jane@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Role</label>
                <select
                  value={inviteForm.role}
                  onChange={e => setInviteForm(f => ({ ...f, role: e.target.value as 'user' | 'administrator' }))}
                  className="input-field w-full text-sm"
                >
                  <option value="user">User</option>
                  <option value="administrator">Administrator</option>
                </select>
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <button type="submit" disabled={inviteSending} className="btn-primary text-sm">
                  {inviteSending ? 'Sending…' : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>

          {/* Users List */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-brand-primary font-serif">Team Members</h2>
              <button type="button" onClick={fetchUsers} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Refresh</button>
            </div>
            {usersLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin w-6 h-6 border-4 border-brand-secondary border-t-transparent rounded-full" />
              </div>
            ) : usersList.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No users found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2 pr-4">Name</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2 pr-4">Email</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2 pr-4">Role</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2 pr-4">Status</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {usersList.map(u => (
                      <tr key={u.id} className="hover:bg-gray-50/50">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-gray-800">{u.displayName ?? (`${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || '—')}</p>
                          {!u.emailVerified && <span className="text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-200 rounded px-1.5 py-0.5 mt-0.5 inline-block">Pending Invite</span>}
                        </td>
                        <td className="py-3 pr-4 text-gray-600">{u.email}</td>
                        <td className="py-3 pr-4">
                          <select
                            value={u.role}
                            onChange={e => handleRoleChange(u.id, e.target.value as 'user' | 'administrator')}
                            className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-secondary"
                          >
                            <option value="user">User</option>
                            <option value="administrator">Administrator</option>
                          </select>
                        </td>
                        <td className="py-3 pr-4">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(u.id, !u.active)}
                            className={`text-xs font-semibold px-2 py-1 rounded border transition-colors ${u.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
                          >
                            {u.active ? 'Active' : 'Suspended'}
                          </button>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            {!u.emailVerified && (
                              <button
                                type="button"
                                onClick={() => handleResendInvite(u.id)}
                                className="text-xs text-brand-secondary hover:text-brand-primary transition-colors font-medium"
                              >
                                Resend
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => { setDeleteModal(u); setReassignToId(''); }}
                              className="text-xs text-red-500 hover:text-red-700 transition-colors font-medium"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Delete User Modal ── */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-brand-primary font-serif mb-2">Delete User</h2>
            <p className="text-sm text-gray-600 mb-4">
              You are about to delete <span className="font-semibold">{deleteModal.displayName ?? deleteModal.email}</span>. All of their assigned companies and incomplete follow-ups will be reassigned to another user.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Reassign records to</label>
              <select
                value={reassignToId}
                onChange={e => setReassignToId(e.target.value ? Number(e.target.value) : '')}
                className="input-field w-full text-sm"
              >
                <option value="">Select a user…</option>
                {usersList.filter(u => u.id !== deleteModal.id).map(u => (
                  <option key={u.id} value={u.id}>{u.displayName ?? u.email}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => { setDeleteModal(null); setReassignToId(''); }}
                className="btn-secondary text-sm"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={!reassignToId || deleting}
                className="text-sm font-semibold px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting…' : 'Delete & Reassign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Admin Forms Tab ────────────────────────────────────────────────────────────

const ADMIN_FIELD_TYPES = [
  { value: 'text_single', label: 'Text (Single Line)' },
  { value: 'text_paragraph', label: 'Text (Paragraph)' },
  { value: 'number', label: 'Number' },
  { value: 'datetime', label: 'Date / Time' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'single_select', label: 'Single Select' },
  { value: 'multi_select', label: 'Multi Select' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'searchable_dropdown', label: 'Searchable Dropdown' },
  { value: 'attendee_picker', label: 'Attendee Name Picker' },
];

const ADMIN_OPTIONS_SOURCES = [
  { value: '', label: 'Custom options' },
  { value: 'attendee_name', label: 'Attendee Name' },
  { value: 'company_name', label: 'Company Name' },
  { value: 'conference_name', label: 'Conference Name' },
  { value: 'assigned_user', label: 'Assigned User' },
];

const HAS_FIELD_OPTIONS = ['dropdown', 'single_select', 'multi_select', 'searchable_dropdown'];

interface AdminFormField {
  id: number;
  field_type: string;
  field_key: string | null;
  label: string;
  placeholder: string | null;
  required: boolean;
  sort_order: number;
  options_source: string | null;
  options: { id: number; value: string; sort_order: number }[];
}

interface AdminFormTemplate {
  id: number;
  name: string;
  created_by: string | null;
  created_at: string;
  fields: AdminFormField[];
}

interface AdminPermission {
  user_config_id: number;
  display_name: string;
}

interface UserOption {
  id: number;
  value: string;
}

function AdminFormsTab() {
  const [templates, setTemplates] = useState<AdminFormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [builderOpenId, setBuilderOpenId] = useState<number | null>(null);
  const [permOpenId, setPermOpenId] = useState<number | null>(null);
  const [permissions, setPermissions] = useState<Record<number, AdminPermission[]>>({});
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [addingTemplate, setAddingTemplate] = useState(false);
  const [newTmplName, setNewTmplName] = useState('');
  const [savingNew, setSavingNew] = useState(false);
  const [editingTmplId, setEditingTmplId] = useState<number | null>(null);
  const [editTmplName, setEditTmplName] = useState('');

  // Field builder state for selected template
  const [addingField, setAddingField] = useState(false);
  const [fieldDraft, setFieldDraft] = useState({ field_type: 'text_single', label: '', placeholder: '', required: false, options_source: '', options: [''] });
  const [savingField, setSavingField] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<number | null>(null);
  const [editFieldDraft, setEditFieldDraft] = useState<Partial<typeof fieldDraft>>({});

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/form-templates');
      if (res.ok) setTemplates(await res.json());
    } catch { toast.error('Failed to load templates'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  useEffect(() => {
    fetch('/api/config?category=user').then(r => r.json()).then(data =>
      setUserOptions(data.map((u: { id: number; value: string }) => ({ id: u.id, value: u.value })))
    ).catch(() => {});
  }, []);

  const loadPermissions = async (templateId: number) => {
    try {
      const res = await fetch(`/api/form-templates/${templateId}/permissions`);
      if (res.ok) {
        const data = await res.json();
        setPermissions(prev => ({ ...prev, [templateId]: data }));
      }
    } catch { /* ignore */ }
  };

  const handleCreateTemplate = async () => {
    if (!newTmplName.trim()) { toast.error('Name required'); return; }
    setSavingNew(true);
    try {
      const res = await fetch('/api/form-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTmplName.trim() }),
      });
      if (!res.ok) throw new Error();
      toast.success('Template created');
      setAddingTemplate(false);
      setNewTmplName('');
      await loadTemplates();
    } catch { toast.error('Failed to create template'); }
    finally { setSavingNew(false); }
  };

  const handleDeleteTemplate = async (id: number, name: string) => {
    if (!confirm(`Delete template "${name}"? This will also remove it from any conferences using it.`)) return;
    try {
      const res = await fetch(`/api/form-templates/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Deleted');
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch { toast.error('Failed to delete'); }
  };

  const handleSaveTemplateName = async (id: number) => {
    if (!editTmplName.trim()) { toast.error('Name required'); return; }
    try {
      const res = await fetch(`/api/form-templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editTmplName.trim() }),
      });
      if (!res.ok) throw new Error();
      toast.success('Saved');
      setEditingTmplId(null);
      await loadTemplates();
    } catch { toast.error('Failed to save'); }
  };

  const handleAddField = async (templateId: number) => {
    if (!fieldDraft.label.trim()) { toast.error('Label required'); return; }
    setSavingField(true);
    try {
      const tmpl = templates.find(t => t.id === templateId);
      const res = await fetch(`/api/form-templates/${templateId}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fieldDraft, sort_order: (tmpl?.fields.length || 0) + 1 }),
      });
      if (!res.ok) throw new Error();
      toast.success('Field added');
      setAddingField(false);
      setFieldDraft({ field_type: 'text_single', label: '', placeholder: '', required: false, options_source: '', options: [''] });
      await loadTemplates();
    } catch { toast.error('Failed to add field'); }
    finally { setSavingField(false); }
  };

  const handleDeleteField = async (templateId: number, fieldId: number) => {
    if (!confirm('Delete this field?')) return;
    try {
      const res = await fetch(`/api/form-templates/${templateId}/fields/${fieldId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Field removed');
      await loadTemplates();
    } catch { toast.error('Failed to delete field'); }
  };

  const handleSaveField = async (templateId: number, fieldId: number) => {
    try {
      const res = await fetch(`/api/form-templates/${templateId}/fields/${fieldId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFieldDraft),
      });
      if (!res.ok) throw new Error();
      toast.success('Saved');
      setEditingFieldId(null);
      await loadTemplates();
    } catch { toast.error('Failed to save field'); }
  };

  const handleAddPermission = async (templateId: number, userConfigId: number) => {
    try {
      await fetch(`/api/form-templates/${templateId}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_config_id: userConfigId }),
      });
      await loadPermissions(templateId);
    } catch { toast.error('Failed to add permission'); }
  };

  const handleRemovePermission = async (templateId: number, userConfigId: number) => {
    try {
      await fetch(`/api/form-templates/${templateId}/permissions`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_config_id: userConfigId }),
      });
      await loadPermissions(templateId);
    } catch { toast.error('Failed to remove permission'); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-brand-primary font-serif">Custom Form Templates</h2>
          <p className="text-sm text-gray-500 mt-0.5">Build global templates that can be added to any conference. Administrators control which users can edit each template.</p>
        </div>
        {!addingTemplate && (
          <button type="button" onClick={() => setAddingTemplate(true)} className="btn-primary text-sm flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            New Template
          </button>
        )}
      </div>

      {/* New template form */}
      {addingTemplate && (
        <div className="card border border-brand-secondary/30 bg-blue-50/20 space-y-3">
          <h3 className="text-sm font-bold text-brand-primary">New Template</h3>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Template Name *</label>
              <input type="text" value={newTmplName} onChange={e => setNewTmplName(e.target.value)} className="input-field text-sm w-full" placeholder="e.g. Lead Capture" onKeyDown={e => { if (e.key === 'Enter') handleCreateTemplate(); }} />
            </div>
            <button type="button" onClick={handleCreateTemplate} disabled={savingNew} className="btn-primary text-sm">{savingNew ? 'Creating…' : 'Create'}</button>
            <button type="button" onClick={() => { setAddingTemplate(false); setNewTmplName(''); }} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {templates.length === 0 && !addingTemplate && (
        <div className="card text-center py-10">
          <p className="text-sm text-gray-400">No templates yet. Click &quot;New Template&quot; to create one.</p>
        </div>
      )}

      {templates.map(tmpl => {
        const isOpen = expandedId === tmpl.id;
        const isBuilderOpen = builderOpenId === tmpl.id;
        const isPermOpen = permOpenId === tmpl.id;
        const tmplPerms = permissions[tmpl.id] || [];

        return (
          <div key={tmpl.id} className="card p-0 overflow-hidden">
            {/* Template header row */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              {editingTmplId === tmpl.id ? (
                <div className="flex gap-2 flex-1 items-center">
                  <input type="text" value={editTmplName} onChange={e => setEditTmplName(e.target.value)} className="input-field text-sm flex-1" onKeyDown={e => { if (e.key === 'Enter') handleSaveTemplateName(tmpl.id); }} />
                  <button type="button" onClick={() => handleSaveTemplateName(tmpl.id)} className="btn-primary text-xs px-3 py-1.5">Save</button>
                  <button type="button" onClick={() => setEditingTmplId(null)} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
                </div>
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-800">{tmpl.name}</span>
                    {tmpl.created_by === 'system' && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-600 font-medium">Default</span>}
                    <span className="text-xs text-gray-400">{tmpl.fields.length} fields</span>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button type="button" onClick={() => { setEditingTmplId(tmpl.id); setEditTmplName(tmpl.name); }} title="Rename" className="p-1.5 rounded-lg text-gray-400 hover:text-brand-secondary hover:bg-blue-50 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button type="button" onClick={() => { setBuilderOpenId(isBuilderOpen ? null : tmpl.id); setAddingField(false); }} title="Manage fields" className={`p-1.5 rounded-lg transition-colors ${isBuilderOpen ? 'text-brand-secondary bg-blue-50' : 'text-gray-400 hover:text-brand-secondary hover:bg-blue-50'}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                </button>
                <button type="button" onClick={() => { setPermOpenId(isPermOpen ? null : tmpl.id); if (!permissions[tmpl.id]) loadPermissions(tmpl.id); }} title="Manage permissions" className={`p-1.5 rounded-lg transition-colors ${isPermOpen ? 'text-brand-secondary bg-blue-50' : 'text-gray-400 hover:text-brand-secondary hover:bg-blue-50'}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                </button>
                <button type="button" onClick={() => handleDeleteTemplate(tmpl.id, tmpl.name)} title="Delete template" className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>

            {/* Fields builder */}
            {isBuilderOpen && (
              <div className="px-5 py-4 bg-gray-50/50 border-b border-gray-100 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Template Fields</p>
                {tmpl.fields.length === 0 && !addingField && <p className="text-xs text-gray-400">No fields. Add one below.</p>}
                {tmpl.fields.map(f => (
                  <div key={f.id} className={`rounded-xl border p-3 bg-white ${editingFieldId === f.id ? 'border-brand-secondary' : 'border-gray-200'}`}>
                    {editingFieldId === f.id ? (
                      <div className="space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Label</label>
                            <input type="text" value={editFieldDraft.label || ''} onChange={e => setEditFieldDraft(d => ({ ...d, label: e.target.value }))} className="input-field text-xs w-full" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Placeholder</label>
                            <input type="text" value={editFieldDraft.placeholder || ''} onChange={e => setEditFieldDraft(d => ({ ...d, placeholder: e.target.value }))} className="input-field text-xs w-full" />
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-gray-700">
                          <input type="checkbox" checked={!!editFieldDraft.required} onChange={e => setEditFieldDraft(d => ({ ...d, required: e.target.checked }))} className="accent-brand-secondary" />
                          Required
                        </label>
                        {HAS_FIELD_OPTIONS.includes(f.field_type) && (
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Options Source</label>
                            <select value={editFieldDraft.options_source || ''} onChange={e => setEditFieldDraft(d => ({ ...d, options_source: e.target.value }))} className="input-field text-xs w-full mb-1.5">
                              {ADMIN_OPTIONS_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                            {!editFieldDraft.options_source && (
                              <div className="space-y-1">
                                {(editFieldDraft.options || []).map((opt, idx) => (
                                  <div key={idx} className="flex gap-1">
                                    <input type="text" value={opt} onChange={e => { const opts = [...(editFieldDraft.options || [])]; opts[idx] = e.target.value; setEditFieldDraft(d => ({ ...d, options: opts })); }} className="input-field text-xs flex-1" />
                                    <button type="button" onClick={() => setEditFieldDraft(d => ({ ...d, options: (d.options || []).filter((_, i) => i !== idx) }))} className="text-red-400 hover:text-red-600"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                                  </div>
                                ))}
                                <button type="button" onClick={() => setEditFieldDraft(d => ({ ...d, options: [...(d.options || []), ''] }))} className="text-xs text-brand-secondary hover:underline">+ Add option</button>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button type="button" onClick={() => handleSaveField(tmpl.id, f.id)} className="btn-primary text-xs px-2.5 py-1">Save</button>
                          <button type="button" onClick={() => setEditingFieldId(null)} className="btn-secondary text-xs px-2.5 py-1">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-semibold text-gray-800">{f.label}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{ADMIN_FIELD_TYPES.find(t => t.value === f.field_type)?.label || f.field_type}</span>
                            {f.required && <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-500">Required</span>}
                          </div>
                          {f.options_source && <p className="text-xs text-gray-400 mt-0.5">Source: {ADMIN_OPTIONS_SOURCES.find(s => s.value === f.options_source)?.label}</p>}
                          {!f.options_source && f.options.length > 0 && <p className="text-xs text-gray-400 mt-0.5">Options: {f.options.map(o => o.value).join(', ')}</p>}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button type="button" onClick={() => { setEditingFieldId(f.id); setEditFieldDraft({ label: f.label, placeholder: f.placeholder || '', required: f.required, options_source: f.options_source || '', options: f.options.length > 0 ? f.options.map(o => o.value) : [''] }); }} className="p-1 text-gray-400 hover:text-brand-secondary transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button type="button" onClick={() => handleDeleteField(tmpl.id, f.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Add field form */}
                {addingField && builderOpenId === tmpl.id ? (
                  <div className="rounded-xl border border-brand-secondary bg-blue-50/10 p-3 space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Field Type</label>
                        <select value={fieldDraft.field_type} onChange={e => setFieldDraft(d => ({ ...d, field_type: e.target.value }))} className="input-field text-xs w-full">
                          {ADMIN_FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Label *</label>
                        <input type="text" value={fieldDraft.label} onChange={e => setFieldDraft(d => ({ ...d, label: e.target.value }))} className="input-field text-xs w-full" placeholder="Field label" />
                      </div>
                    </div>
                    <input type="text" value={fieldDraft.placeholder} onChange={e => setFieldDraft(d => ({ ...d, placeholder: e.target.value }))} className="input-field text-xs w-full" placeholder="Placeholder (optional)" />
                    <label className="flex items-center gap-2 text-xs text-gray-700">
                      <input type="checkbox" checked={fieldDraft.required} onChange={e => setFieldDraft(d => ({ ...d, required: e.target.checked }))} className="accent-brand-secondary" />
                      Required
                    </label>
                    {HAS_FIELD_OPTIONS.includes(fieldDraft.field_type) && (
                      <div>
                        <select value={fieldDraft.options_source} onChange={e => setFieldDraft(d => ({ ...d, options_source: e.target.value }))} className="input-field text-xs w-full mb-1.5">
                          {ADMIN_OPTIONS_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                        {!fieldDraft.options_source && (
                          <div className="space-y-1">
                            {fieldDraft.options.map((opt, idx) => (
                              <div key={idx} className="flex gap-1">
                                <input type="text" value={opt} onChange={e => { const opts = [...fieldDraft.options]; opts[idx] = e.target.value; setFieldDraft(d => ({ ...d, options: opts })); }} className="input-field text-xs flex-1" placeholder={`Option ${idx + 1}`} />
                                {fieldDraft.options.length > 1 && <button type="button" onClick={() => setFieldDraft(d => ({ ...d, options: d.options.filter((_, i) => i !== idx) }))} className="text-red-400 hover:text-red-600"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>}
                              </div>
                            ))}
                            <button type="button" onClick={() => setFieldDraft(d => ({ ...d, options: [...d.options, ''] }))} className="text-xs text-brand-secondary hover:underline">+ Add option</button>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleAddField(tmpl.id)} disabled={savingField} className="btn-primary text-xs px-2.5 py-1">{savingField ? 'Adding…' : 'Add Field'}</button>
                      <button type="button" onClick={() => { setAddingField(false); setFieldDraft({ field_type: 'text_single', label: '', placeholder: '', required: false, options_source: '', options: [''] }); }} className="btn-secondary text-xs px-2.5 py-1">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => { setAddingField(true); setBuilderOpenId(tmpl.id); }} className="btn-secondary text-xs flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Add Field
                  </button>
                )}
              </div>
            )}

            {/* Permissions panel */}
            {isPermOpen && (
              <div className="px-5 py-4 border-b border-gray-100 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Edit Permissions</p>
                <p className="text-xs text-gray-400">Grant users the ability to edit this template&apos;s fields.</p>
                {tmplPerms.length === 0 ? (
                  <p className="text-xs text-gray-400">No users have edit access yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {tmplPerms.map(p => (
                      <span key={p.user_config_id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                        {p.display_name}
                        <button type="button" onClick={() => handleRemovePermission(tmpl.id, p.user_config_id)} className="hover:text-red-500 transition-colors">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 items-center">
                  <select
                    defaultValue=""
                    onChange={e => { if (e.target.value) { handleAddPermission(tmpl.id, Number(e.target.value)); e.target.value = ''; } }}
                    className="input-field text-xs flex-1"
                  >
                    <option value="">— Grant access to user… —</option>
                    {userOptions
                      .filter(u => !tmplPerms.some(p => p.user_config_id === u.id))
                      .map(u => <option key={u.id} value={u.id}>{u.value}</option>)
                    }
                  </select>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Admin Email Templates Tab ────────────────────────────────────────────────

interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  body: string;
  created_at: string;
}

function AdminEmailTemplatesTab() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', subject: '', body: '' });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', subject: '', body: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchTemplates = useCallback(() => {
    setLoading(true);
    fetch('/api/email-templates')
      .then(r => r.ok ? r.json() : [])
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
      toast.error('All fields are required.'); return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error ?? 'Failed to create.'); return; }
      toast.success('Template created.');
      setForm({ name: '', subject: '', body: '' });
      fetchTemplates();
    } catch { toast.error('Network error.'); }
    finally { setSaving(false); }
  };

  const handleEdit = (tmpl: EmailTemplate) => {
    setEditId(tmpl.id);
    setEditForm({ name: tmpl.name, subject: tmpl.subject, body: tmpl.body });
  };

  const handleSaveEdit = async (id: number) => {
    if (!editForm.name.trim() || !editForm.subject.trim() || !editForm.body.trim()) {
      toast.error('All fields are required.'); return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/email-templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error ?? 'Failed to save.'); return; }
      toast.success('Template saved.');
      setEditId(null);
      fetchTemplates();
    } catch { toast.error('Network error.'); }
    finally { setSavingEdit(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this template? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/email-templates/${id}`, { method: 'DELETE' });
      if (!res.ok) { toast.error('Failed to delete.'); return; }
      toast.success('Template deleted.');
      fetchTemplates();
    } catch { toast.error('Network error.'); }
    finally { setDeletingId(null); }
  };

  return (
    <div className="space-y-6">
      {/* Create form */}
      <div className="card">
        <h2 className="text-base font-semibold text-brand-primary font-serif mb-1">New Template</h2>
        <p className="text-sm text-gray-500 mb-4">Create reusable email templates for outreach. Team members can select these when composing emails.</p>
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Template Name</label>
            <input className="input-field w-full text-sm" placeholder="e.g. Initial Outreach" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Subject</label>
            <input className="input-field w-full text-sm" placeholder="Email subject line" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Body (HTML supported)</label>
            <textarea
              className="input-field w-full text-sm font-mono"
              rows={6}
              placeholder="<p>Hi {{name}},</p><p>...</p>"
              value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              required
            />
            <p className="text-xs text-gray-400 mt-1">HTML is rendered in the compose editor. Plain text is also accepted.</p>
          </div>
          <button type="submit" disabled={saving} className="btn-primary text-sm">
            {saving ? 'Creating…' : 'Create Template'}
          </button>
        </form>
      </div>

      {/* Existing templates */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-brand-primary font-serif">Templates</h2>
        </div>
        {loading ? (
          <div className="px-6 py-8 space-y-3">
            {[1, 2].map(i => <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : templates.length === 0 ? (
          <p className="px-6 py-8 text-sm text-gray-400 text-center">No templates yet. Create one above.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {templates.map(tmpl => (
              <div key={tmpl.id} className="px-6 py-4">
                {editId === tmpl.id ? (
                  <div className="space-y-3">
                    <input className="input-field w-full text-sm" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="Template Name" />
                    <input className="input-field w-full text-sm" value={editForm.subject} onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))} placeholder="Subject" />
                    <textarea className="input-field w-full text-sm font-mono" rows={5} value={editForm.body} onChange={e => setEditForm(f => ({ ...f, body: e.target.value }))} placeholder="Body (HTML)" />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleSaveEdit(tmpl.id)} disabled={savingEdit} className="btn-primary text-xs px-3 py-1.5">{savingEdit ? 'Saving…' : 'Save'}</button>
                      <button type="button" onClick={() => setEditId(null)} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{tmpl.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{tmpl.subject}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button type="button" onClick={() => handleEdit(tmpl)} className="text-xs text-brand-secondary hover:underline font-medium">Edit</button>
                      <button type="button" onClick={() => handleDelete(tmpl.id)} disabled={deletingId === tmpl.id} className="text-xs text-red-500 hover:underline font-medium">
                        {deletingId === tmpl.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Admin Integrations Tab ───────────────────────────────────────────────────

interface OAuthConfigState {
  // Client IDs are shown in full; secrets are booleans (true = already set)
  oauth_google_client_id: string;
  oauth_google_client_secret: boolean;
  oauth_microsoft_client_id: string;
  oauth_microsoft_client_secret: boolean;
  oauth_microsoft_tenant_id: string;
}

function AdminIntegrationsTab() {
  const [config, setConfig] = useState<OAuthConfigState | null>(null);
  const [loading, setLoading] = useState(true);

  // Editable field values — secrets start blank (blank = "keep existing")
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [msClientId, setMsClientId] = useState('');
  const [msClientSecret, setMsClientSecret] = useState('');
  const [msTenantId, setMsTenantId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/admin/oauth-config')
      .then(r => r.ok ? r.json() : null)
      .then((data: OAuthConfigState | null) => {
        if (!data) return;
        setConfig(data);
        setGoogleClientId(data.oauth_google_client_id ?? '');
        setMsClientId(data.oauth_microsoft_client_id ?? '');
        setMsTenantId(data.oauth_microsoft_tenant_id ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, string> = {
        oauth_google_client_id: googleClientId.trim(),
        oauth_microsoft_client_id: msClientId.trim(),
        oauth_microsoft_tenant_id: msTenantId.trim() || 'common',
      };
      // Only send secrets if the user typed something; blank = keep existing
      if (googleClientSecret.trim()) body.oauth_google_client_secret = googleClientSecret.trim();
      if (msClientSecret.trim()) body.oauth_microsoft_client_secret = msClientSecret.trim();

      const res = await fetch('/api/admin/oauth-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { toast.error('Failed to save.'); return; }
      toast.success('Integration settings saved.');
      setGoogleClientSecret('');
      setMsClientSecret('');
      // Re-fetch to update "is set" indicators
      const updated = await fetch('/api/admin/oauth-config').then(r => r.ok ? r.json() : null);
      if (updated) setConfig(updated);
    } catch { toast.error('Network error.'); }
    finally { setSaving(false); }
  };

  const base = typeof window !== 'undefined' ? window.location.origin : '';

  if (loading) return (
    <div className="space-y-4">
      {[1, 2].map(i => <div key={i} className="card h-40 animate-pulse bg-gray-50" />)}
    </div>
  );

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="card space-y-5">
        <div>
          <h2 className="text-base font-semibold text-brand-primary font-serif">Email Outreach — OAuth Credentials</h2>
          <p className="text-sm text-gray-500 mt-1">
            Enter your own Google and/or Microsoft OAuth app credentials so your team can connect their work email accounts.
            Credentials are stored in your database and never shared externally.
          </p>
        </div>

        {/* Google */}
        <div className="space-y-3 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <h3 className="text-sm font-semibold text-gray-800">Google (Gmail)</h3>
          </div>
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-500 space-y-1">
            <p className="font-medium text-gray-600">Setup steps:</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>console.cloud.google.com → New Project → Enable <strong>Gmail API</strong></li>
              <li>OAuth consent screen → External → add scope <code className="bg-gray-200 px-1 rounded">gmail.send</code></li>
              <li>Credentials → OAuth 2.0 Client ID → Web application</li>
              <li>Authorized redirect URI: <code className="bg-gray-200 px-1 rounded break-all">{base}/api/oauth/google/callback</code></li>
            </ol>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Client ID</label>
              <input
                className="input-field w-full text-sm"
                placeholder="12345-abc.apps.googleusercontent.com"
                value={googleClientId}
                onChange={e => setGoogleClientId(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                Client Secret
                {config?.oauth_google_client_secret && <span className="ml-2 text-green-600 font-normal normal-case">● Set</span>}
              </label>
              <input
                type="password"
                className="input-field w-full text-sm"
                placeholder={config?.oauth_google_client_secret ? 'Leave blank to keep existing' : 'Paste secret here'}
                value={googleClientSecret}
                onChange={e => setGoogleClientSecret(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
        </div>

        {/* Microsoft */}
        <div className="space-y-3 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
              <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
              <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
              <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
              <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
            </svg>
            <h3 className="text-sm font-semibold text-gray-800">Microsoft (Outlook / M365)</h3>
          </div>
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-500 space-y-1">
            <p className="font-medium text-gray-600">Setup steps:</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>portal.azure.com → Azure Active Directory → App registrations → New registration</li>
              <li>API permissions → Microsoft Graph → Delegated → <code className="bg-gray-200 px-1 rounded">Mail.Send</code> + <code className="bg-gray-200 px-1 rounded">offline_access</code></li>
              <li>Certificates &amp; secrets → New client secret → copy it immediately</li>
              <li>Redirect URI: <code className="bg-gray-200 px-1 rounded break-all">{base}/api/oauth/microsoft/callback</code></li>
            </ol>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Client ID (Application ID)</label>
              <input
                className="input-field w-full text-sm"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={msClientId}
                onChange={e => setMsClientId(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                Client Secret
                {config?.oauth_microsoft_client_secret && <span className="ml-2 text-green-600 font-normal normal-case">● Set</span>}
              </label>
              <input
                type="password"
                className="input-field w-full text-sm"
                placeholder={config?.oauth_microsoft_client_secret ? 'Leave blank to keep existing' : 'Paste secret here'}
                value={msClientSecret}
                onChange={e => setMsClientSecret(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Tenant ID</label>
              <input
                className="input-field w-full text-sm"
                placeholder="common"
                value={msTenantId}
                onChange={e => setMsTenantId(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">Use <code className="bg-gray-100 px-1 rounded">common</code> to allow any Microsoft/M365 account, or your specific tenant ID to restrict to one org.</p>
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-gray-100">
          <button type="submit" disabled={saving} className="btn-primary text-sm">
            {saving ? 'Saving…' : 'Save Credentials'}
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── Admin Effectiveness Defaults Tab ─────────────────────────────────────────

interface RepDefaultEntry {
  avgDealSize: string;
  dealConversionRate: string;
}

function AdminEffectivenessTab() {
  const [section1Open, setSection1Open] = useState(false);
  const [section2Open, setSection2Open] = useState(false);
  const [section3Open, setSection3Open] = useState(false);
  const [section4Open, setSection4Open] = useState(false);
  const [loading, setLoading] = useState(true);

  // Section 1: Conference Costs
  const [costTypeOptions, setCostTypeOptions] = useState<ConfigOption[]>([]);
  const [conferenceCostTypes, setConferenceCostTypes] = useState<string[]>([]);
  const [showCostPicker, setShowCostPicker] = useState(false);
  const [pendingCostTypes, setPendingCostTypes] = useState<string[]>([]);
  const [savingCostTypes, setSavingCostTypes] = useState(false);

  // Section 2: Deal Defaults
  const [avgAnnualDealSize, setAvgAnnualDealSize] = useState('');
  const [avgCostPerUnit, setAvgCostPerUnit] = useState('');
  const [conversionRate, setConversionRate] = useState('');
  const [expectedReturn, setExpectedReturn] = useState('');
  const [savingField, setSavingField] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Rep Defaults sub-section
  const [userOptions, setUserOptions] = useState<ConfigOption[]>([]);
  const [repDefaults, setRepDefaults] = useState<Record<number, RepDefaultEntry>>({});
  const [savingRepId, setSavingRepId] = useState<number | null>(null);
  const [repErrors, setRepErrors] = useState<Record<number, { avgDealSize?: string; dealConversionRate?: string }>>({});

  // Section 3: Event Conversion Rates
  const [meetingsHeldRate, setMeetingsHeldRate] = useState('');
  const [followUpRate, setFollowUpRate] = useState('');
  const [touchpointRate, setTouchpointRate] = useState('');
  const [hostedEventRate, setHostedEventRate] = useState('');

  // Section 4: Annual Conference Budgets
  interface AnnualBudgetRow { id: number; year: number; amount: number; }
  const [annualBudgets, setAnnualBudgets] = useState<AnnualBudgetRow[]>([]);
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [newBudgetYear, setNewBudgetYear] = useState(String(new Date().getFullYear() + 1));
  const [newBudgetAmount, setNewBudgetAmount] = useState('');
  const [addBudgetError, setAddBudgetError] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Record<number, string>>({});
  const [savingBudgetId, setSavingBudgetId] = useState<number | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [costTypesData, effectivenessData, usersData, annualBudgetsData] = await Promise.all([
        fetch('/api/config?category=cost_type').then(r => r.json()),
        fetch('/api/admin/effectiveness').then(r => r.json()),
        fetch('/api/config?category=user').then(r => r.json()),
        fetch('/api/admin/annual-budgets').then(r => r.json()),
      ]);
      setCostTypeOptions(Array.isArray(costTypesData) ? costTypesData : []);
      setUserOptions(Array.isArray(usersData) ? usersData : []);
      const d = effectivenessData as Record<string, string>;
      setConferenceCostTypes(d.conference_cost_types ? JSON.parse(d.conference_cost_types) : []);
      setAvgAnnualDealSize(d.avg_annual_deal_size ?? '');
      setAvgCostPerUnit(d.avg_cost_per_unit ?? '');
      setConversionRate(d.conversion_rate ?? '');
      setExpectedReturn(d.expected_return_on_event_cost ?? '');
      setRepDefaults(d.rep_defaults ? JSON.parse(d.rep_defaults) : {});
      setMeetingsHeldRate(d.meetings_held_conversion_rate ?? '');
      setFollowUpRate(d.follow_up_meeting_conversion_rate ?? '');
      setTouchpointRate(d.touchpoint_conversion_rate ?? '');
      setHostedEventRate(d.hosted_event_attendee_conversion_rate ?? '');
      setAnnualBudgets(Array.isArray(annualBudgetsData) ? annualBudgetsData : []);
      setEditingBudget(
        Object.fromEntries((Array.isArray(annualBudgetsData) ? annualBudgetsData : []).map(
          (b: { id: number; year: number; amount: number }) => [b.id, String(b.amount)]
        ))
      );
    } catch { toast.error('Failed to load effectiveness defaults.'); }
    finally { setLoading(false); }
  };

  const saveKey = async (key: string, value: string) => {
    setSavingField(key);
    try {
      const res = await fetch('/api/admin/effectiveness', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) throw new Error();
      toast.success('Saved!');
    } catch { toast.error('Failed to save.'); }
    finally { setSavingField(null); }
  };

  const validateDollarNumber = (val: string): string => {
    if (!val.trim()) return '';
    const n = parseFloat(val.replace(/,/g, ''));
    if (isNaN(n) || n < 0) return 'Must be a positive number';
    return '';
  };

  const validatePercentage = (val: string): string => {
    if (!val.trim()) return '';
    const n = parseFloat(val);
    if (isNaN(n) || n < 0 || n > 100) return 'Must be a number between 0 and 100';
    return '';
  };

  const validateDecimal3 = (val: string): string => {
    if (!val.trim()) return '';
    const n = parseFloat(val);
    if (isNaN(n) || n < 0) return 'Must be a positive number';
    if (!/^\d+(\.\d{0,3})?$/.test(val.trim())) return 'Up to 3 decimal places allowed (e.g. 3.867)';
    return '';
  };

  const handleSaveField = async (key: string, value: string, validate: (v: string) => string) => {
    const err = validate(value);
    if (err) { setFieldErrors(prev => ({ ...prev, [key]: err })); return; }
    setFieldErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
    await saveKey(key, value);
  };

  const handleSaveCostTypes = async () => {
    setSavingCostTypes(true);
    try {
      const merged = Array.from(new Set([...conferenceCostTypes, ...pendingCostTypes]));
      const res = await fetch('/api/admin/effectiveness', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'conference_cost_types', value: JSON.stringify(merged) }),
      });
      if (!res.ok) throw new Error();
      setConferenceCostTypes(merged);
      setPendingCostTypes([]);
      setShowCostPicker(false);
      toast.success('Saved!');
    } catch { toast.error('Failed to save.'); }
    finally { setSavingCostTypes(false); }
  };

  const handleRemoveCostType = async (val: string) => {
    const updated = conferenceCostTypes.filter(v => v !== val);
    try {
      const res = await fetch('/api/admin/effectiveness', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'conference_cost_types', value: JSON.stringify(updated) }),
      });
      if (!res.ok) throw new Error();
      setConferenceCostTypes(updated);
      toast.success('Removed.');
    } catch { toast.error('Failed to update.'); }
  };

  const handleSaveRepDefault = async (optionId: number) => {
    const rep = repDefaults[optionId] ?? { avgDealSize: '', dealConversionRate: '' };
    const errors: { avgDealSize?: string; dealConversionRate?: string } = {};
    const sizeErr = validateDollarNumber(rep.avgDealSize);
    if (sizeErr) errors.avgDealSize = sizeErr;
    const rateErr = validatePercentage(rep.dealConversionRate);
    if (rateErr) errors.dealConversionRate = rateErr;
    setRepErrors(prev => ({ ...prev, [optionId]: errors }));
    if (Object.keys(errors).length > 0) return;
    setSavingRepId(optionId);
    try {
      const updated = { ...repDefaults, [optionId]: rep };
      const res = await fetch('/api/admin/effectiveness', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'rep_defaults', value: JSON.stringify(updated) }),
      });
      if (!res.ok) throw new Error();
      setRepDefaults(updated);
      toast.success('Rep defaults saved!');
    } catch { toast.error('Failed to save.'); }
    finally { setSavingRepId(null); }
  };

  const handleAddBudget = async () => {
    setAddBudgetError('');
    const year = parseInt(newBudgetYear, 10);
    const amount = parseFloat(newBudgetAmount.replace(/,/g, ''));
    if (!newBudgetYear || isNaN(year) || year < 1000 || year > 9999) {
      setAddBudgetError('Enter a valid 4-digit year.');
      return;
    }
    if (!newBudgetAmount || isNaN(amount) || amount <= 0) {
      setAddBudgetError('Enter a valid positive amount.');
      return;
    }
    setSavingBudget(true);
    try {
      const res = await fetch('/api/admin/annual-budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, amount }),
      });
      const data = await res.json();
      if (!res.ok) { setAddBudgetError(data.error ?? 'Failed to add.'); return; }
      setAnnualBudgets(prev => [data, ...prev].sort((a, b) => b.year - a.year));
      setEditingBudget(prev => ({ ...prev, [data.id]: String(data.amount) }));
      setNewBudgetYear(String(new Date().getFullYear() + 1));
      setNewBudgetAmount('');
      setShowAddBudget(false);
      toast.success('Annual budget added!');
    } catch { setAddBudgetError('Failed to add.'); }
    finally { setSavingBudget(false); }
  };

  const handleSaveBudget = async (id: number) => {
    const amount = parseFloat((editingBudget[id] ?? '').replace(/,/g, ''));
    if (isNaN(amount) || amount <= 0) { toast.error('Enter a valid positive amount.'); return; }
    setSavingBudgetId(id);
    try {
      const res = await fetch(`/api/admin/annual-budgets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) throw new Error();
      setAnnualBudgets(prev => prev.map(b => b.id === id ? { ...b, amount } : b));
      toast.success('Budget updated!');
    } catch { toast.error('Failed to save.'); }
    finally { setSavingBudgetId(null); }
  };

  const handleDeleteBudget = async (id: number) => {
    if (!confirm('Remove this annual budget entry?')) return;
    try {
      const res = await fetch(`/api/admin/annual-budgets/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setAnnualBudgets(prev => prev.filter(b => b.id !== id));
      setEditingBudget(prev => { const n = { ...prev }; delete n[id]; return n; });
      toast.success('Budget removed.');
    } catch { toast.error('Failed to remove.'); }
  };

  const SectionChevron = ({ open }: { open: boolean }) => (
    <svg className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Configure default values and benchmarks used for event effectiveness reporting.</p>

      {/* ── Section 1: Conference Costs ── */}
      <div className="card p-0 overflow-hidden">
        <button
          type="button"
          onClick={() => setSection1Open(p => !p)}
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
        >
          <h2 className="text-base font-semibold text-brand-primary font-serif">Conference Costs</h2>
          <SectionChevron open={section1Open} />
        </button>
        {section1Open && (
          <div className="border-t border-gray-100 px-6 py-5 space-y-4">
            <p className="text-sm text-gray-500">Select the cost types that are included in every conference by default.</p>

            {conferenceCostTypes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {conferenceCostTypes.map(val => (
                  <span key={val} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-blue-50 text-blue-700 border border-blue-200">
                    {val}
                    <button type="button" onClick={() => handleRemoveCostType(val)} className="text-blue-400 hover:text-blue-700 transition-colors" title={`Remove ${val}`}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </span>
                ))}
              </div>
            )}
            {conferenceCostTypes.length === 0 && !showCostPicker && (
              <p className="text-sm text-gray-400">No default cost types selected.</p>
            )}

            {showCostPicker ? (
              <div className="border border-gray-200 rounded-lg bg-gray-50 p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select Cost Types to Add</p>
                {costTypeOptions.filter(o => !conferenceCostTypes.includes(o.value)).length === 0 ? (
                  <p className="text-sm text-gray-400">All cost types are already selected.</p>
                ) : (
                  <div className="space-y-1.5">
                    {costTypeOptions.filter(o => !conferenceCostTypes.includes(o.value)).map(opt => {
                      const checked = pendingCostTypes.includes(opt.value);
                      return (
                        <label key={opt.id} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setPendingCostTypes(prev => checked ? prev.filter(v => v !== opt.value) : [...prev, opt.value])}
                            className="accent-brand-secondary"
                          />
                          {opt.value}
                        </label>
                      );
                    })}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleSaveCostTypes}
                    disabled={savingCostTypes || pendingCostTypes.length === 0}
                    className="btn-primary text-sm"
                  >
                    {savingCostTypes ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowCostPicker(false); setPendingCostTypes([]); }}
                    className="btn-secondary text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowCostPicker(true)}
                className="flex items-center gap-1.5 text-sm text-brand-secondary font-medium hover:opacity-75 transition-opacity"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add Cost Types
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Section 2: Deal Defaults ── */}
      <div className="card p-0 overflow-hidden">
        <button
          type="button"
          onClick={() => setSection2Open(p => !p)}
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
        >
          <h2 className="text-base font-semibold text-brand-primary font-serif">Deal Defaults</h2>
          <SectionChevron open={section2Open} />
        </button>
        {section2Open && (
          <div className="border-t border-gray-100 px-6 py-5 space-y-5">
            {/* Average Annual Deal Size */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Average Annual Deal Size</label>
              <div className="flex items-start gap-2">
                <div className="flex items-center flex-1 max-w-xs">
                  <span className="px-3 py-2 bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg text-sm text-gray-500 select-none">$</span>
                  <input
                    type="text"
                    value={avgAnnualDealSize}
                    onChange={e => { setAvgAnnualDealSize(e.target.value); setFieldErrors(p => { const n = { ...p }; delete n.avg_annual_deal_size; return n; }); }}
                    className={`input-field rounded-l-none flex-1 text-sm ${fieldErrors.avg_annual_deal_size ? 'border-red-400' : ''}`}
                    placeholder="e.g. 50000"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleSaveField('avg_annual_deal_size', avgAnnualDealSize, validateDollarNumber)}
                  disabled={savingField === 'avg_annual_deal_size'}
                  className="btn-primary text-sm flex-shrink-0"
                >
                  {savingField === 'avg_annual_deal_size' ? 'Saving…' : 'Save'}
                </button>
              </div>
              {fieldErrors.avg_annual_deal_size && <p className="text-xs text-red-500 mt-1">{fieldErrors.avg_annual_deal_size}</p>}
            </div>

            {/* Average Cost per Unit */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Average Cost per Unit</label>
              <div className="flex items-start gap-2">
                <div className="flex items-center flex-1 max-w-xs">
                  <span className="px-3 py-2 bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg text-sm text-gray-500 select-none">$</span>
                  <input
                    type="text"
                    value={avgCostPerUnit}
                    onChange={e => { setAvgCostPerUnit(e.target.value); setFieldErrors(p => { const n = { ...p }; delete n.avg_cost_per_unit; return n; }); }}
                    className={`input-field rounded-l-none flex-1 text-sm ${fieldErrors.avg_cost_per_unit ? 'border-red-400' : ''}`}
                    placeholder="e.g. 1000"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleSaveField('avg_cost_per_unit', avgCostPerUnit, validateDollarNumber)}
                  disabled={savingField === 'avg_cost_per_unit'}
                  className="btn-primary text-sm flex-shrink-0"
                >
                  {savingField === 'avg_cost_per_unit' ? 'Saving…' : 'Save'}
                </button>
              </div>
              {fieldErrors.avg_cost_per_unit && <p className="text-xs text-red-500 mt-1">{fieldErrors.avg_cost_per_unit}</p>}
            </div>

            {/* Conversion Rate */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Conversion Rate</label>
              <div className="flex items-start gap-2">
                <div className="flex items-center flex-1 max-w-xs">
                  <input
                    type="text"
                    value={conversionRate}
                    onChange={e => { setConversionRate(e.target.value); setFieldErrors(p => { const n = { ...p }; delete n.conversion_rate; return n; }); }}
                    className={`input-field rounded-r-none flex-1 text-sm ${fieldErrors.conversion_rate ? 'border-red-400' : ''}`}
                    placeholder="e.g. 25"
                  />
                  <span className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-sm text-gray-500 select-none">%</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSaveField('conversion_rate', conversionRate, validatePercentage)}
                  disabled={savingField === 'conversion_rate'}
                  className="btn-primary text-sm flex-shrink-0"
                >
                  {savingField === 'conversion_rate' ? 'Saving…' : 'Save'}
                </button>
              </div>
              {fieldErrors.conversion_rate && <p className="text-xs text-red-500 mt-1">{fieldErrors.conversion_rate}</p>}
            </div>

            {/* Expected Return on Event Cost */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Expected Return on Event Cost</label>
              <div className="flex items-start gap-2">
                <input
                  type="text"
                  value={expectedReturn}
                  onChange={e => { setExpectedReturn(e.target.value); setFieldErrors(p => { const n = { ...p }; delete n.expected_return_on_event_cost; return n; }); }}
                  className={`input-field flex-1 max-w-xs text-sm ${fieldErrors.expected_return_on_event_cost ? 'border-red-400' : ''}`}
                  placeholder="e.g. 3.867"
                />
                <button
                  type="button"
                  onClick={() => handleSaveField('expected_return_on_event_cost', expectedReturn, validateDecimal3)}
                  disabled={savingField === 'expected_return_on_event_cost'}
                  className="btn-primary text-sm flex-shrink-0"
                >
                  {savingField === 'expected_return_on_event_cost' ? 'Saving…' : 'Save'}
                </button>
              </div>
              {fieldErrors.expected_return_on_event_cost && <p className="text-xs text-red-500 mt-1">{fieldErrors.expected_return_on_event_cost}</p>}
              <p className="text-xs text-gray-400 mt-1">Decimal number, up to 3 places (e.g. 3.867)</p>
            </div>

            {/* Rep Defaults sub-section */}
            {userOptions.length > 0 && (
              <div className="border-t border-gray-100 pt-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Rep Defaults</h3>
                <div className="space-y-4">
                  {userOptions.map(opt => {
                    const rep = repDefaults[opt.id] ?? { avgDealSize: '', dealConversionRate: '' };
                    const repErr = repErrors[opt.id] ?? {};
                    return (
                      <div key={opt.id} className="flex flex-wrap items-start gap-3">
                        <span className="text-sm font-medium text-gray-700 min-w-[100px] pt-2 flex-shrink-0">{opt.value}:</span>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center">
                            <span className="px-2.5 py-[7px] bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg text-xs text-gray-500 select-none">$</span>
                            <input
                              type="text"
                              value={rep.avgDealSize}
                              onChange={e => setRepDefaults(prev => ({ ...prev, [opt.id]: { ...prev[opt.id] ?? { avgDealSize: '', dealConversionRate: '' }, avgDealSize: e.target.value } }))}
                              className={`input-field rounded-l-none w-32 text-sm ${repErr.avgDealSize ? 'border-red-400' : ''}`}
                              placeholder="Avg Deal Size"
                            />
                          </div>
                          {repErr.avgDealSize && <p className="text-xs text-red-500">{repErr.avgDealSize}</p>}
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center">
                            <input
                              type="text"
                              value={rep.dealConversionRate}
                              onChange={e => setRepDefaults(prev => ({ ...prev, [opt.id]: { ...prev[opt.id] ?? { avgDealSize: '', dealConversionRate: '' }, dealConversionRate: e.target.value } }))}
                              className={`input-field rounded-r-none w-28 text-sm ${repErr.dealConversionRate ? 'border-red-400' : ''}`}
                              placeholder="Conv. Rate"
                            />
                            <span className="px-2.5 py-[7px] bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-xs text-gray-500 select-none">%</span>
                          </div>
                          {repErr.dealConversionRate && <p className="text-xs text-red-500">{repErr.dealConversionRate}</p>}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSaveRepDefault(opt.id)}
                          disabled={savingRepId === opt.id}
                          className="btn-primary text-sm"
                        >
                          {savingRepId === opt.id ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Section 3: Event Conversion Rates ── */}
      <div className="card p-0 overflow-hidden">
        <button
          type="button"
          onClick={() => setSection3Open(p => !p)}
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
        >
          <div>
            <h2 className="text-base font-semibold text-brand-primary font-serif text-left">Event Conversion Rates</h2>
            <p className="text-xs text-gray-400 mt-0.5 text-left font-normal">The % at which an event interaction converts into a post-conference meeting</p>
          </div>
          <SectionChevron open={section3Open} />
        </button>
        {section3Open && (
          <div className="border-t border-gray-100 px-6 py-5 space-y-5">
            {[
              {
                key: 'meetings_held_conversion_rate',
                label: 'Meetings Held Conversion Rate',
                desc: 'The % of Conference Meetings Scheduled that are actually Held',
                value: meetingsHeldRate,
                setter: setMeetingsHeldRate,
              },
              {
                key: 'follow_up_meeting_conversion_rate',
                label: 'Follow Up Meeting Conversion Rate',
                desc: 'The % of Meetings Held that lead to post-conference meetings',
                value: followUpRate,
                setter: setFollowUpRate,
              },
              {
                key: 'touchpoint_conversion_rate',
                label: 'Touchpoint Conversion Rate',
                desc: 'The % of conference Touchpoints that lead to post-conference meetings',
                value: touchpointRate,
                setter: setTouchpointRate,
              },
              {
                key: 'hosted_event_attendee_conversion_rate',
                label: 'Hosted Event Attendee Conversion Rate',
                desc: 'The % of attendees who attend a Company Hosted event that lead to post-conference meetings',
                value: hostedEventRate,
                setter: setHostedEventRate,
              },
            ].map(({ key, label, desc, value, setter }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-0.5">{label}</label>
                <p className="text-xs text-gray-400 mb-1.5">{desc}</p>
                <div className="flex items-start gap-2">
                  <div className="flex items-center flex-1 max-w-xs">
                    <input
                      type="text"
                      value={value}
                      onChange={e => { setter(e.target.value); setFieldErrors(p => { const n = { ...p }; delete n[key]; return n; }); }}
                      className={`input-field rounded-r-none flex-1 text-sm ${fieldErrors[key] ? 'border-red-400' : ''}`}
                      placeholder="e.g. 75"
                    />
                    <span className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-sm text-gray-500 select-none">%</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveField(key, value, validatePercentage)}
                    disabled={savingField === key}
                    className="btn-primary text-sm flex-shrink-0"
                  >
                    {savingField === key ? 'Saving…' : 'Save'}
                  </button>
                </div>
                {fieldErrors[key] && <p className="text-xs text-red-500 mt-1">{fieldErrors[key]}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 4: Annual Conference Budgets ── */}
      <div className="card p-0 overflow-hidden">
        <button
          type="button"
          onClick={() => setSection4Open(p => !p)}
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
        >
          <div>
            <h2 className="text-base font-semibold text-brand-primary font-serif text-left">Annual Conference Budgets</h2>
            <p className="text-xs text-gray-400 mt-0.5 text-left font-normal">Set a total conference budget per calendar year for global spend reporting</p>
          </div>
          <SectionChevron open={section4Open} />
        </button>
        {section4Open && (
          <div className="border-t border-gray-100 px-6 py-5 space-y-3">
            {annualBudgets.length === 0 && !showAddBudget && (
              <p className="text-sm text-gray-400 italic">No annual budgets set yet.</p>
            )}
            {annualBudgets.map(budget => (
              <div key={budget.id} className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700 w-14 flex-shrink-0">{budget.year}</span>
                <div className="flex items-center flex-1 max-w-xs">
                  <span className="px-3 py-2 bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg text-sm text-gray-500 select-none">$</span>
                  <input
                    type="text"
                    value={editingBudget[budget.id] ?? ''}
                    onChange={e => setEditingBudget(prev => ({ ...prev, [budget.id]: e.target.value }))}
                    className="input-field rounded-none flex-1 text-sm"
                    placeholder="e.g. 2000000"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleSaveBudget(budget.id)}
                  disabled={savingBudgetId === budget.id}
                  className="btn-primary text-sm flex-shrink-0"
                >
                  {savingBudgetId === budget.id ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteBudget(budget.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                  title="Remove"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}

            {showAddBudget && (
              <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-14 flex-shrink-0">
                    <input
                      type="number"
                      value={newBudgetYear}
                      onChange={e => { setNewBudgetYear(e.target.value); setAddBudgetError(''); }}
                      className="input-field text-sm w-full"
                      placeholder="Year"
                      min={2000}
                      max={2100}
                    />
                  </div>
                  <div className="flex items-center flex-1 max-w-xs">
                    <span className="px-3 py-2 bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg text-sm text-gray-500 select-none">$</span>
                    <input
                      type="text"
                      value={newBudgetAmount}
                      onChange={e => { setNewBudgetAmount(e.target.value); setAddBudgetError(''); }}
                      className="input-field rounded-none flex-1 text-sm"
                      placeholder="e.g. 2000000"
                      onKeyDown={e => e.key === 'Enter' && handleAddBudget()}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddBudget}
                    disabled={savingBudget}
                    className="btn-primary text-sm flex-shrink-0"
                  >
                    {savingBudget ? 'Adding…' : 'Add'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddBudget(false); setAddBudgetError(''); }}
                    className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {addBudgetError && <p className="text-xs text-red-500">{addBudgetError}</p>}
              </div>
            )}

            {!showAddBudget && (
              <button
                type="button"
                onClick={() => setShowAddBudget(true)}
                className="flex items-center gap-1.5 text-sm text-brand-secondary hover:text-brand-secondary/80 font-medium mt-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Year
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
