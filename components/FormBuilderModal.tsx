'use client';

import { useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import type { FormField } from './ExpandedFormModal';

const FIELD_TYPES = [
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

const OPTIONS_SOURCES = [
  { value: '', label: 'Custom options (enter below)' },
  { value: 'attendee_name', label: 'Attendee Name (Title & Company)' },
  { value: 'company_name', label: 'Company Name' },
  { value: 'conference_name', label: 'Conference Name' },
  { value: 'assigned_user', label: 'Assigned User' },
];

const HAS_OPTIONS = ['dropdown', 'single_select', 'multi_select', 'searchable_dropdown'];

interface NewField {
  field_type: string;
  label: string;
  placeholder: string;
  required: boolean;
  options_source: string;
  options: string[];
}

interface Props {
  title: string;
  fields: FormField[];
  canEditTemplateFields?: boolean;
  onAddField: (field: NewField) => Promise<void>;
  onUpdateField: (fieldId: number, updates: Partial<NewField>) => Promise<void>;
  onDeleteField: (fieldId: number, isTemplate: boolean) => Promise<void>;
  onReorderFields?: (updates: { id: number; sort_order: number }[]) => Promise<void>;
  onClose: () => void;
}

export function FormBuilderModal({
  title,
  fields,
  canEditTemplateFields = true,
  onAddField,
  onUpdateField,
  onDeleteField,
  onReorderFields,
  onClose,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [savingAdd, setSavingAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Local ordered state for drag-and-drop — syncs when fields prop changes
  const [orderedFields, setOrderedFields] = useState<FormField[]>(() =>
    [...fields].sort((a, b) => a.sort_order - b.sort_order)
  );
  useEffect(() => {
    setOrderedFields([...fields].sort((a, b) => a.sort_order - b.sort_order));
  }, [fields]);

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDrop = useCallback((toIndex: number) => {
    if (dragIndex === null) return;
    setDragIndex(null);
    setDragOverIndex(null);
    if (dragIndex === toIndex) return;
    const next = [...orderedFields];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(toIndex, 0, moved);
    setOrderedFields(next);
    // Persist new sort_orders for every field
    const updates = next.map((f, i) => ({ id: f.id, sort_order: i + 1 }));
    onReorderFields?.(updates);
  }, [dragIndex, orderedFields, onReorderFields]);

  const emptyNew: NewField = { field_type: 'text_single', label: '', placeholder: '', required: false, options_source: '', options: [''] };
  const [newField, setNewField] = useState<NewField>(emptyNew);
  const [editDraft, setEditDraft] = useState<Partial<NewField>>({});

  const updateNewOptions = (idx: number, val: string) => {
    setNewField(prev => {
      const opts = [...prev.options];
      opts[idx] = val;
      return { ...prev, options: opts };
    });
  };

  const handleAdd = async () => {
    if (!newField.label.trim()) { toast.error('Label is required'); return; }
    setSavingAdd(true);
    try {
      await onAddField(newField);
      setNewField(emptyNew);
      setAdding(false);
    } finally {
      setSavingAdd(false);
    }
  };

  const startEdit = (f: FormField) => {
    setEditingId(f.id);
    setEditDraft({
      label: f.label,
      placeholder: f.placeholder || '',
      required: f.required,
      options_source: f.options_source || '',
      options: f.options.length > 0 ? f.options.map(o => o.value) : [''],
    });
  };

  const handleSaveEdit = async (fieldId: number) => {
    setSavingEdit(true);
    try {
      await onUpdateField(fieldId, editDraft);
      setEditingId(null);
    } finally {
      setSavingEdit(false);
    }
  };

  const showOptionsFor = (ft: string) => HAS_OPTIONS.includes(ft);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-auto" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-brand-primary font-serif">{title}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {orderedFields.length === 0 && !adding && (
            <p className="text-sm text-gray-400 py-4 text-center">No fields yet. Add one below.</p>
          )}

          {orderedFields.map((f, i) => (
            <div
              key={f.id}
              draggable={editingId !== f.id}
              onDragStart={() => setDragIndex(i)}
              onDragOver={e => { e.preventDefault(); setDragOverIndex(i); }}
              onDrop={() => handleDrop(i)}
              onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
              className={[
                'rounded-xl border p-4 transition-all select-none',
                editingId === f.id
                  ? 'border-brand-secondary bg-blue-50/30 cursor-default select-text'
                  : 'border-gray-200 bg-white cursor-grab hover:border-gray-300',
                dragOverIndex === i && dragIndex !== i
                  ? 'ring-2 ring-brand-secondary border-brand-secondary shadow-md'
                  : '',
                dragIndex === i ? 'opacity-40' : '',
              ].join(' ')}
            >
              {editingId === f.id ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Label</label>
                      <input
                        type="text"
                        value={editDraft.label || ''}
                        onChange={e => setEditDraft(d => ({ ...d, label: e.target.value }))}
                        className="input-field text-sm w-full"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Placeholder</label>
                      <input
                        type="text"
                        value={editDraft.placeholder || ''}
                        onChange={e => setEditDraft(d => ({ ...d, placeholder: e.target.value }))}
                        className="input-field text-sm w-full"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={!!editDraft.required} onChange={e => setEditDraft(d => ({ ...d, required: e.target.checked }))} className="accent-brand-secondary" />
                    Required
                  </label>
                  {showOptionsFor(f.field_type) && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Options Source</label>
                      <select
                        value={editDraft.options_source || ''}
                        onChange={e => setEditDraft(d => ({ ...d, options_source: e.target.value }))}
                        className="input-field text-sm w-full mb-2"
                      >
                        {OPTIONS_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                      {!editDraft.options_source && (
                        <div className="space-y-1.5">
                          <label className="block text-xs font-semibold text-gray-500">Options</label>
                          {(editDraft.options || ['']).map((opt, idx) => (
                            <div key={idx} className="flex gap-2">
                              <input
                                type="text"
                                value={opt}
                                onChange={e => {
                                  const opts = [...(editDraft.options || [''])];
                                  opts[idx] = e.target.value;
                                  setEditDraft(d => ({ ...d, options: opts }));
                                }}
                                className="input-field text-sm flex-1"
                                placeholder={`Option ${idx + 1}`}
                              />
                              <button type="button" onClick={() => setEditDraft(d => ({ ...d, options: (d.options || []).filter((_, i) => i !== idx) }))} className="text-red-400 hover:text-red-600">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </div>
                          ))}
                          <button type="button" onClick={() => setEditDraft(d => ({ ...d, options: [...(d.options || []), ''] }))} className="text-xs text-brand-secondary hover:underline">+ Add option</button>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => handleSaveEdit(f.id)} disabled={savingEdit} className="btn-primary text-xs px-3 py-1.5">{savingEdit ? 'Saving…' : 'Save'}</button>
                    <button type="button" onClick={() => setEditingId(null)} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2.5">
                  {/* Drag grip */}
                  <svg className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="8" cy="5" r="1.5" /><circle cx="16" cy="5" r="1.5" />
                    <circle cx="8" cy="12" r="1.5" /><circle cx="16" cy="12" r="1.5" />
                    <circle cx="8" cy="19" r="1.5" /><circle cx="16" cy="19" r="1.5" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-gray-800">{f.label}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{FIELD_TYPES.find(t => t.value === f.field_type)?.label || f.field_type}</span>
                      {f.required && <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-500">Required</span>}
                      {f.is_template_field && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-500">Template</span>}
                    </div>
                    {f.options_source && <p className="text-xs text-gray-400 mt-0.5">Source: {OPTIONS_SOURCES.find(s => s.value === f.options_source)?.label || f.options_source}</p>}
                    {!f.options_source && f.options.length > 0 && <p className="text-xs text-gray-400 mt-0.5">Options: {f.options.map(o => o.value).join(', ')}</p>}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    {(canEditTemplateFields || !f.is_template_field) && (
                      <button type="button" onClick={() => startEdit(f)} className="text-gray-400 hover:text-brand-secondary transition-colors p-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                    )}
                    {!f.is_template_field && (
                      <button type="button" onClick={() => onDeleteField(f.id, false)} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                    {f.is_template_field && canEditTemplateFields && (
                      <button type="button" onClick={() => onDeleteField(f.id, true)} className="text-gray-400 hover:text-red-500 transition-colors p-1" title="Remove from template">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add new field form */}
          {adding && (
            <div className="rounded-xl border border-brand-secondary bg-blue-50/20 p-4 space-y-3">
              <h3 className="text-sm font-bold text-brand-primary">New Field</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Field Type</label>
                  <select value={newField.field_type} onChange={e => setNewField(f => ({ ...f, field_type: e.target.value }))} className="input-field text-sm w-full">
                    {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Label *</label>
                  <input type="text" value={newField.label} onChange={e => setNewField(f => ({ ...f, label: e.target.value }))} className="input-field text-sm w-full" placeholder="Field label" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Placeholder</label>
                <input type="text" value={newField.placeholder} onChange={e => setNewField(f => ({ ...f, placeholder: e.target.value }))} className="input-field text-sm w-full" placeholder="Optional placeholder text" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={newField.required} onChange={e => setNewField(f => ({ ...f, required: e.target.checked }))} className="accent-brand-secondary" />
                Required
              </label>
              {showOptionsFor(newField.field_type) && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Options Source</label>
                  <select value={newField.options_source} onChange={e => setNewField(f => ({ ...f, options_source: e.target.value }))} className="input-field text-sm w-full mb-2">
                    {OPTIONS_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  {!newField.options_source && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-gray-500">Options</label>
                      {newField.options.map((opt, idx) => (
                        <div key={idx} className="flex gap-2">
                          <input
                            type="text"
                            value={opt}
                            onChange={e => updateNewOptions(idx, e.target.value)}
                            className="input-field text-sm flex-1"
                            placeholder={`Option ${idx + 1}`}
                          />
                          {newField.options.length > 1 && (
                            <button type="button" onClick={() => setNewField(f => ({ ...f, options: f.options.filter((_, i) => i !== idx) }))} className="text-red-400 hover:text-red-600">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={() => setNewField(f => ({ ...f, options: [...f.options, ''] }))} className="text-xs text-brand-secondary hover:underline">+ Add option</button>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={handleAdd} disabled={savingAdd} className="btn-primary text-xs px-3 py-1.5">{savingAdd ? 'Adding…' : 'Add Field'}</button>
                <button type="button" onClick={() => { setAdding(false); setNewField(emptyNew); }} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          {!adding && (
            <button type="button" onClick={() => setAdding(true)} className="btn-secondary text-sm flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Field
            </button>
          )}
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="btn-primary text-sm">Done</button>
        </div>
      </div>
    </div>
  );
}
