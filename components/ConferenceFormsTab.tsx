'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { ExpandedFormModal, buildAccentBackground, type FormField, type ConferenceForm } from './ExpandedFormModal';
import { FormBuilderModal } from './FormBuilderModal';

function getCssVarHex(varName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const rgb = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  const parts = rgb.split(' ').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return fallback;
  return '#' + parts.map(n => n.toString(16).padStart(2, '0')).join('');
}

interface AttendeeOption {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
  company_name?: string;
  email?: string;
}

interface FormTemplate {
  id: number;
  name: string;
  fields: FormField[];
}

interface Submission {
  id: number;
  conference_form_id: number;
  conference_id: number;
  attendee_id: number | null;
  company_id: number | null;
  submitted_at: string;
  status_option_id: number | null;
  status_value: string | null;
  conference_name: string;
  values: { field_id: number | null; field_label: string; field_value: string }[];
}

interface StatusOption {
  id: number;
  value: string;
}

interface Props {
  conferenceId: number;
  conferenceName: string;
  attendees: AttendeeOption[];
  brandLogoUrl?: string | null;
  isAdmin: boolean;
  currentUserEmail: string;
}

function fmtDate(d?: string) {
  if (!d) return '—';
  try {
    return new Date(d.includes('Z') ? d : d + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return '—'; }
}

export function ConferenceFormsTab({ conferenceId, conferenceName, attendees, brandLogoUrl, isAdmin, currentUserEmail }: Props) {
  const [forms, setForms] = useState<ConferenceForm[]>([]);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Form state
  const [addingForm, setAddingForm] = useState(false);
  const [newFormName, setNewFormName] = useState('');
  const [newFormTemplate, setNewFormTemplate] = useState<number | null>(null);
  const [newFormLogo, setNewFormLogo] = useState('');
  const [newFormBgColor, setNewFormBgColor] = useState('');
  const [newFormAccentColor, setNewFormAccentColor] = useState('');
  const [savingNewForm, setSavingNewForm] = useState(false);

  // Expanded form
  const [expandedForm, setExpandedForm] = useState<ConferenceForm | null>(null);

  // Submissions
  const [submissions, setSubmissions] = useState<Record<number, Submission[]>>({});
  const [loadedSubmissions, setLoadedSubmissions] = useState<Set<number>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());


  // Builder
  const [builderFormId, setBuilderFormId] = useState<number | null>(null);

  // Edit form settings
  const [editingFormId, setEditingFormId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{
    name: string;
    conference_logo_url: string;
    background_color: string;
    accent_color: string;
    accent_gradient: string;
    image_url: string;
    image_max_width: string;
    html_content: string;
    image_offset_y: number;
    html_offset_y: number;
    form_width: number;
    form_height: number | null;
    form_offset_y: number;
  }>({ name: '', conference_logo_url: '', background_color: '', accent_color: '', accent_gradient: 'none', image_url: '', image_max_width: '80', html_content: '', image_offset_y: 0, html_offset_y: 0, form_width: 420, form_height: null, form_offset_y: 0 });

  const loadForms = useCallback(async () => {
    try {
      const [formsRes, templatesRes, statusRes] = await Promise.all([
        fetch(`/api/conference-forms?conference_id=${conferenceId}`),
        fetch('/api/form-templates'),
        fetch('/api/config?category=status'),
      ]);
      if (formsRes.ok) setForms(await formsRes.json());
      if (templatesRes.ok) setTemplates(await templatesRes.json());
      if (statusRes.ok) {
        const data = await statusRes.json();
        setStatusOptions(data.map((o: { id: number; value: string }) => ({ id: o.id, value: o.value })));
      }
    } catch { toast.error('Failed to load forms'); }
    finally { setLoading(false); }
  }, [conferenceId]);

  useEffect(() => { loadForms(); }, [loadForms]);

  const loadSubmissions = useCallback(async (formId: number) => {
    if (loadedSubmissions.has(formId)) return;
    try {
      const res = await fetch(`/api/form-submissions?conference_form_id=${formId}`);
      if (res.ok) {
        const data = await res.json();
        setSubmissions(prev => ({ ...prev, [formId]: data }));
        setLoadedSubmissions(prev => new Set(prev).add(formId));
      }
    } catch { toast.error('Failed to load submissions'); }
  }, [loadedSubmissions]);

  const toggleRow = (formId: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(formId)) { next.delete(formId); } else {
        next.add(formId);
        loadSubmissions(formId);
      }
      return next;
    });
  };

  const handleCreateForm = async () => {
    if (!newFormName.trim()) { toast.error('Form name is required'); return; }
    setSavingNewForm(true);
    try {
      const res = await fetch('/api/conference-forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conference_id: conferenceId,
          template_id: newFormTemplate || null,
          name: newFormName.trim(),
          conference_logo_url: newFormLogo.trim() || null,
          background_color: newFormBgColor.trim() || null,
          accent_color: newFormAccentColor.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Form created!');
      setAddingForm(false);
      setNewFormName('');
      setNewFormTemplate(null);
      setNewFormLogo('');
      setNewFormBgColor('');
      setNewFormAccentColor('');
      await loadForms();
    } catch { toast.error('Failed to create form'); }
    finally { setSavingNewForm(false); }
  };

  const handleDeleteForm = async (formId: number) => {
    if (!confirm('Delete this form and all its submissions? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/conference-forms/${formId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Form deleted');
      setForms(prev => prev.filter(f => f.id !== formId));
    } catch { toast.error('Failed to delete form'); }
  };

  const handleStatusChange = async (sub: Submission, formId: number, optionId: number | null) => {
    const statusOpt = statusOptions.find(s => s.id === optionId);
    const statusValue = statusOpt?.value || '';
    try {
      await fetch(`/api/form-submissions/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_option_id: optionId }),
      });
      // Propagate status to the linked company (cascades to attendees) or directly to attendee
      if (statusValue) {
        if (sub.company_id) {
          fetch(`/api/companies/${sub.company_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: statusValue }),
          }).catch(() => {});
        } else if (sub.attendee_id) {
          fetch(`/api/attendees/${sub.attendee_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: statusValue }),
          }).catch(() => {});
        }
      }
      setSubmissions(prev => ({
        ...prev,
        [formId]: (prev[formId] || []).map(s =>
          s.id === sub.id ? { ...s, status_option_id: optionId, status_value: statusOpt?.value || null } : s
        ),
      }));
    } catch { toast.error('Failed to update status'); }
  };

  const handleExport = (form: ConferenceForm) => {
    const subs = submissions[form.id] || [];
    if (subs.length === 0) { toast('No submissions to export'); return; }
    const dataFields = form.fields.filter(f => f.field_key !== 'attendee_name');
    const headers = ['Conference', 'Name', ...dataFields.map(f => f.label), 'Submitted At', 'Status'];
    const rows = subs.map(sub => {
      const nameVal = sub.values.find(v => v.field_label === 'Name')?.field_value || '';
      const row: (string | number)[] = [sub.conference_name, nameVal];
      for (const f of dataFields) {
        const v = sub.values.find(vv => vv.field_label === f.label);
        row.push(v?.field_value || '');
      }
      row.push(sub.submitted_at ? new Date(sub.submitted_at).toLocaleString() : '');
      row.push(sub.status_value || '');
      return row;
    });
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Submissions');
    XLSX.writeFile(wb, `${form.name.replace(/[^a-z0-9]/gi, '_')}_submissions.xlsx`);
  };

  const handleSaveEditForm = async (formId: number) => {
    try {
      const res = await fetch(`/api/conference-forms/${formId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editDraft.name.trim(),
          conference_logo_url: editDraft.conference_logo_url.trim() || null,
          background_color: editDraft.background_color.trim() || null,
          accent_color: editDraft.accent_color.trim() || null,
          accent_gradient: editDraft.accent_gradient || null,
          image_url: editDraft.image_url.trim() || null,
          image_max_width: editDraft.image_max_width ? parseInt(editDraft.image_max_width, 10) : null,
          html_content: editDraft.html_content.trim() || null,
          image_offset_y: editDraft.image_offset_y,
          html_offset_y: editDraft.html_offset_y,
          form_width: editDraft.form_width,
          form_height: editDraft.form_height,
          form_offset_y: editDraft.form_offset_y,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Saved');
      setEditingFormId(null);
      await loadForms();
    } catch { toast.error('Failed to save'); }
  };

  const builderForm = forms.find(f => f.id === builderFormId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-brand-primary font-serif">Conference Forms</h2>
          <p className="text-sm text-gray-500 mt-0.5">Lead capture forms for this conference.</p>
        </div>
        {!addingForm && (
          <button
            type="button"
            onClick={() => setAddingForm(true)}
            className="btn-primary text-sm flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Form
          </button>
        )}
      </div>

      {/* Add form panel */}
      {addingForm && (
        <div className="card border border-brand-secondary/30 bg-blue-50/20 space-y-4">
          <h3 className="text-sm font-bold text-brand-primary">New Conference Form</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Form Name *</label>
              <input type="text" value={newFormName} onChange={e => setNewFormName(e.target.value)} className="input-field text-sm w-full" placeholder="e.g. Lead Capture — Day 1" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Template</label>
              <select value={newFormTemplate ?? ''} onChange={e => setNewFormTemplate(e.target.value ? Number(e.target.value) : null)} className="input-field text-sm w-full">
                <option value="">— No template (blank form) —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Conference Logo URL</label>
              <input type="url" value={newFormLogo} onChange={e => setNewFormLogo(e.target.value)} className="input-field text-sm w-full" placeholder="https://..." />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Form Card Color</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={newFormBgColor || '#0B3C62'} onChange={e => setNewFormBgColor(e.target.value)} className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5 bg-white" />
                <input type="text" value={newFormBgColor} onChange={e => setNewFormBgColor(e.target.value)} className="input-field text-sm flex-1" placeholder="#0B3C62 (default brand primary)" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Page Background Color</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={newFormAccentColor || '#FFCB3F'} onChange={e => setNewFormAccentColor(e.target.value)} className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5 bg-white" />
                <input type="text" value={newFormAccentColor} onChange={e => setNewFormAccentColor(e.target.value)} className="input-field text-sm flex-1" placeholder="#FFCB3F (default brand gold)" />
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={handleCreateForm} disabled={savingNewForm} className="btn-primary text-sm">{savingNewForm ? 'Creating…' : 'Create Form'}</button>
            <button type="button" onClick={() => setAddingForm(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {forms.length === 0 && !addingForm && (
        <div className="card text-center py-12">
          <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          <p className="text-sm text-gray-400">No forms yet. Click &quot;Add Form&quot; to create one.</p>
        </div>
      )}

      {forms.map(form => {
        const isExpanded = expandedRows.has(form.id);
        const subs = submissions[form.id] || [];
        const isEditing = editingFormId === form.id;
        // All fields except the attendee_picker — shown as data columns
        const dataFields = form.fields.filter(f => f.field_key !== 'attendee_name');

        return (
          <div key={form.id} className="card p-0 overflow-hidden">
            {/* Form header row */}
            {isEditing ? (
              <div className="p-4 space-y-5 bg-blue-50/20 border-b border-gray-100">
                <h3 className="text-sm font-bold text-brand-primary">Edit Form Settings</h3>

                {/* Row 1: Name + Logo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Form Name</label>
                    <input type="text" value={editDraft.name} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))} className="input-field text-sm w-full" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Conference Logo URL</label>
                    <input type="url" value={editDraft.conference_logo_url} onChange={e => setEditDraft(d => ({ ...d, conference_logo_url: e.target.value }))} className="input-field text-sm w-full" placeholder="https://..." />
                  </div>
                </div>

                {/* Row 2: Form card color + Page background color */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Form Card Color</label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={editDraft.background_color || '#0B3C62'} onChange={e => setEditDraft(d => ({ ...d, background_color: e.target.value }))} className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5 bg-white" />
                      <input type="text" value={editDraft.background_color} onChange={e => setEditDraft(d => ({ ...d, background_color: e.target.value }))} className="input-field text-sm flex-1" placeholder="#0B3C62" />
                      <button type="button" onClick={() => setEditDraft(d => ({ ...d, background_color: getCssVarHex('--brand-primary-rgb', '#0B3C62') }))} className="text-xs text-brand-secondary hover:underline whitespace-nowrap">Brand default</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Page Background Color</label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={editDraft.accent_color || '#FFCB3F'} onChange={e => setEditDraft(d => ({ ...d, accent_color: e.target.value }))} className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5 bg-white" />
                      <input type="text" value={editDraft.accent_color} onChange={e => setEditDraft(d => ({ ...d, accent_color: e.target.value }))} className="input-field text-sm flex-1" placeholder="#FFCB3F" />
                      <button type="button" onClick={() => setEditDraft(d => ({ ...d, accent_color: getCssVarHex('--brand-highlight-rgb', '#FFCB3F') }))} className="text-xs text-brand-secondary hover:underline whitespace-nowrap">Brand default</button>
                    </div>
                  </div>
                </div>

                {/* Row 3: Gradient selector with live swatches */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2">Background Gradient</label>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { value: 'none', label: 'None' },
                      { value: 'radial-light', label: 'Radial Light' },
                      { value: 'radial-dark', label: 'Radial Dark' },
                      { value: 'linear-top', label: 'Linear ↓' },
                      { value: 'linear-bottom', label: 'Linear ↑' },
                    ] as const).map(opt => {
                      const preview = buildAccentBackground(editDraft.accent_color || '#FFCB3F', opt.value === 'none' ? null : opt.value);
                      const active = editDraft.accent_gradient === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setEditDraft(d => ({ ...d, accent_gradient: opt.value }))}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${active ? 'border-brand-secondary ring-1 ring-brand-secondary' : 'border-gray-200 hover:border-gray-300'}`}
                        >
                          <span className="w-8 h-4 rounded flex-shrink-0" style={{ background: preview, border: '1px solid rgba(0,0,0,0.1)' }} />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Row 4: Form dimensions + Y position (landscape only) */}
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-500">Form Dimensions <span className="font-normal text-gray-400">(landscape/desktop only — portrait stays full-width)</span></p>

                  {/* Width */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-14 flex-shrink-0">Width</span>
                    <button type="button" onClick={() => setEditDraft(d => ({ ...d, form_width: Math.max(280, d.form_width - 20) }))} className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-600 font-bold text-base leading-none" title="Narrower">‹</button>
                    <span className="w-16 text-center text-sm font-medium tabular-nums">{editDraft.form_width} px</span>
                    <button type="button" onClick={() => setEditDraft(d => ({ ...d, form_width: Math.min(700, d.form_width + 20) }))} className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-600 font-bold text-base leading-none" title="Wider">›</button>
                    <span className="text-xs text-gray-400 ml-1">280–700 px</span>
                  </div>

                  {/* Height */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-14 flex-shrink-0">Height</span>
                    <button type="button" onClick={() => setEditDraft(d => ({ ...d, form_height: Math.max(200, (d.form_height ?? 560) - 20) }))} className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-600 font-bold text-base leading-none" title="Shorter">‹</button>
                    <span className="w-16 text-center text-sm font-medium tabular-nums">{editDraft.form_height != null ? `${editDraft.form_height} px` : 'Auto'}</span>
                    <button type="button" onClick={() => setEditDraft(d => ({ ...d, form_height: Math.min(1200, (d.form_height ?? 560) + 20) }))} className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-600 font-bold text-base leading-none" title="Taller">›</button>
                    <span className="text-xs text-gray-400 ml-1">200–1200 px</span>
                    {editDraft.form_height != null && (
                      <button type="button" onClick={() => setEditDraft(d => ({ ...d, form_height: null, form_offset_y: 0 }))} className="text-xs text-gray-400 hover:text-gray-600 ml-1">Reset (Auto)</button>
                    )}
                  </div>

                  {/* Y Position */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500 w-14 flex-shrink-0">Y Pos</span>
                    <button type="button" onClick={() => setEditDraft(d => ({ ...d, form_offset_y: d.form_offset_y - 20 }))} className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-600" title="Move up">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" /></svg>
                    </button>
                    <input
                      type="number"
                      value={editDraft.form_offset_y}
                      onChange={e => setEditDraft(d => ({ ...d, form_offset_y: parseInt(e.target.value, 10) || 0 }))}
                      className="w-20 text-center input-field text-xs tabular-nums"
                    />
                    <span className="text-xs text-gray-400">px</span>
                    <button type="button" onClick={() => setEditDraft(d => ({ ...d, form_offset_y: d.form_offset_y + 20 }))} className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-600" title="Move down">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditDraft(d => {
                        const h = d.form_height ?? 560;
                        const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
                        return { ...d, form_offset_y: Math.round((vh - h) / 2) };
                      })}
                      className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-600 transition-colors ml-1 whitespace-nowrap"
                      title="Set Y so the form is vertically centered based on its height"
                    >
                      ⊙ Center
                    </button>
                    <button type="button" onClick={() => setEditDraft(d => ({ ...d, form_offset_y: 0 }))} className="text-xs text-gray-400 hover:text-gray-600">Reset</button>
                  </div>
                </div>

                {/* Row 5: Image element */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Image Element <span className="font-normal text-gray-400">(landscape/desktop left panel)</span></label>
                  <div className="flex gap-3 items-start">
                    <div className="flex-1">
                      <input type="url" value={editDraft.image_url} onChange={e => setEditDraft(d => ({ ...d, image_url: e.target.value }))} className="input-field text-sm w-full" placeholder="https://example.com/image.png" />
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <label className="text-xs text-gray-500 whitespace-nowrap">Max width</label>
                      <input type="number" min={10} max={100} value={editDraft.image_max_width} onChange={e => setEditDraft(d => ({ ...d, image_max_width: e.target.value }))} className="input-field text-sm w-16 text-center" />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-500 whitespace-nowrap">Y Position</span>
                    <button type="button" onClick={() => setEditDraft(d => ({ ...d, image_offset_y: d.image_offset_y - 20 }))} className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-600" title="Move up">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" /></svg>
                    </button>
                    <input type="number" value={editDraft.image_offset_y} onChange={e => setEditDraft(d => ({ ...d, image_offset_y: parseInt(e.target.value, 10) || 0 }))} className="w-20 text-center input-field text-xs tabular-nums" />
                    <span className="text-xs text-gray-400">px</span>
                    <button type="button" onClick={() => setEditDraft(d => ({ ...d, image_offset_y: d.image_offset_y + 20 }))} className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-600" title="Move down">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    <button type="button" onClick={() => setEditDraft(d => ({ ...d, image_offset_y: 0 }))} className="text-xs text-gray-400 hover:text-gray-600 ml-1">Reset</button>
                  </div>
                  {editDraft.image_url && (
                    <div className="mt-2">
                      <img src={editDraft.image_url} alt="Preview" className="max-h-20 rounded border border-gray-200 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </div>
                  )}
                </div>

                {/* Row 6: HTML text editor */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">HTML Text Element <span className="font-normal text-gray-400">(landscape/desktop left panel)</span></label>
                  <HtmlEditor value={editDraft.html_content} onChange={v => setEditDraft(d => ({ ...d, html_content: v }))} />
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-500 whitespace-nowrap">Y Position</span>
                    <button type="button" onClick={() => setEditDraft(d => ({ ...d, html_offset_y: d.html_offset_y - 20 }))} className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-600" title="Move up">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" /></svg>
                    </button>
                    <input type="number" value={editDraft.html_offset_y} onChange={e => setEditDraft(d => ({ ...d, html_offset_y: parseInt(e.target.value, 10) || 0 }))} className="w-20 text-center input-field text-xs tabular-nums" />
                    <span className="text-xs text-gray-400">px</span>
                    <button type="button" onClick={() => setEditDraft(d => ({ ...d, html_offset_y: d.html_offset_y + 20 }))} className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-600" title="Move down">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    <button type="button" onClick={() => setEditDraft(d => ({ ...d, html_offset_y: 0 }))} className="text-xs text-gray-400 hover:text-gray-600 ml-1">Reset</button>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => handleSaveEditForm(form.id)} className="btn-primary text-xs px-3 py-1.5">Save</button>
                  <button type="button" onClick={() => setEditingFormId(null)} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="px-4 py-4 border-b border-gray-100 space-y-3">
                {/* Row 1: form name + collapse toggle */}
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-bold text-gray-800 leading-snug flex-1 min-w-0">{form.name}</h3>
                  <button
                    type="button"
                    onClick={() => toggleRow(form.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0 mt-0.5"
                    title={isExpanded ? 'Collapse' : 'Show submissions'}
                  >
                    <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {/* Row 2: metadata */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">{form.submission_count ?? 0} submissions</span>
                  <span className="text-xs text-gray-400 truncate max-w-[160px]">by {form.created_by || '—'}</span>
                  <span className="text-xs text-gray-400">{fmtDate(form.created_at)}</span>
                </div>

                {/* Row 3: action bar */}
                <div className="flex items-center justify-between gap-2">
                  {/* Utility icons — left cluster */}
                  <div className="flex items-center gap-1">
                    {/* Export */}
                    <button
                      type="button"
                      onClick={() => { loadSubmissions(form.id); setTimeout(() => handleExport(form), 300); }}
                      title="Export to Excel"
                      className="p-2 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
                    </button>
                    {/* Edit form settings */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingFormId(form.id);
                        setEditDraft({
                          name: form.name,
                          conference_logo_url: form.conference_logo_url || '',
                          background_color: form.background_color || getCssVarHex('--brand-primary-rgb', '#0B3C62'),
                          accent_color: form.accent_color || getCssVarHex('--brand-highlight-rgb', '#FFCB3F'),
                          accent_gradient: form.accent_gradient || 'none',
                          image_url: form.image_url || '',
                          image_max_width: form.image_max_width != null ? String(form.image_max_width) : '80',
                          html_content: form.html_content || '',
                          image_offset_y: form.image_offset_y ?? 0,
                          html_offset_y: form.html_offset_y ?? 0,
                          form_width: form.form_width ?? 420,
                          form_height: form.form_height ?? null,
                          form_offset_y: form.form_offset_y ?? 0,
                        });
                      }}
                      title="Edit form settings"
                      className="p-2 rounded-lg text-gray-400 hover:text-brand-secondary hover:bg-blue-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </button>
                    {/* Build / add fields */}
                    <button
                      type="button"
                      onClick={() => setBuilderFormId(form.id)}
                      title="Add/edit fields"
                      className="p-2 rounded-lg text-gray-400 hover:text-brand-secondary hover:bg-blue-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    </button>
                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => handleDeleteForm(form.id)}
                      title="Delete form"
                      className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                  {/* Expand Form — primary CTA, right side */}
                  <button
                    type="button"
                    onClick={() => setExpandedForm(form)}
                    className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 flex-shrink-0"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                    Expand Form
                  </button>
                </div>
              </div>
            )}

            {/* Submissions */}
            {isExpanded && (
              <>
                {subs.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-400">No submissions yet.</div>
                ) : (
                  <>
                    {/* Mobile cards */}
                    <div className="md:hidden divide-y divide-gray-100">
                      {subs.map(sub => {
                        const nameVal = sub.values.find(v => v.field_label === 'Name')?.field_value || '—';
                        return (
                          <div key={sub.id} className="p-4 space-y-3">
                            {/* Card header: name + date */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                {sub.attendee_id ? (
                                  <a href={`/attendees/${sub.attendee_id}`} className="font-semibold text-sm text-brand-secondary hover:underline leading-snug block">{nameVal}</a>
                                ) : (
                                  <p className="font-semibold text-sm text-gray-800 leading-snug">{nameVal}</p>
                                )}
                                <p className="text-xs text-gray-400 mt-0.5">{sub.conference_name}</p>
                              </div>
                              <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">{fmtDate(sub.submitted_at)}</span>
                            </div>
                            {/* Field values grid */}
                            {dataFields.length > 0 && (
                              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                {dataFields.map(f => {
                                  const v = sub.values.find(vv => vv.field_label === f.label);
                                  const isCompany = f.field_key === 'company' || f.label.toLowerCase() === 'company';
                                  return (
                                    <div key={f.id}>
                                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{f.label}</p>
                                      <div className="text-sm text-gray-700 truncate">
                                        {isCompany && sub.company_id && v?.field_value ? (
                                          <a href={`/companies/${sub.company_id}`} className="text-brand-secondary hover:underline">{v.field_value}</a>
                                        ) : (
                                          v?.field_value || '—'
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {/* Status */}
                            <div className="pt-1 border-t border-gray-100">
                              <select
                                value={sub.status_option_id ?? ''}
                                onChange={e => handleStatusChange(sub, form.id, e.target.value ? Number(e.target.value) : null)}
                                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 hover:border-gray-300 transition-colors"
                              >
                                <option value="">— Status —</option>
                                {statusOptions.map(s => <option key={s.id} value={s.id}>{s.value}</option>)}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Conference</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Name</th>
                            {dataFields.map(f => (
                              <th key={f.id} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{f.label}</th>
                            ))}
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Submitted</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {subs.map(sub => {
                            const nameVal = sub.values.find(v => v.field_label === 'Name')?.field_value || '—';
                            return (
                              <tr key={sub.id} className="hover:bg-gray-50/70 transition-colors">
                                <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{sub.conference_name}</td>
                                <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                                  {sub.attendee_id ? (
                                    <a href={`/attendees/${sub.attendee_id}`} className="text-brand-secondary hover:underline">{nameVal}</a>
                                  ) : (
                                    <span className="text-gray-800">{nameVal}</span>
                                  )}
                                </td>
                                {dataFields.map(f => {
                                  const v = sub.values.find(vv => vv.field_label === f.label);
                                  const isCompany = f.field_key === 'company' || f.label.toLowerCase() === 'company';
                                  return (
                                    <td key={f.id} className="px-4 py-2.5 text-gray-700 max-w-xs">
                                      <div className="truncate">
                                        {isCompany && sub.company_id && v?.field_value ? (
                                          <a href={`/companies/${sub.company_id}`} className="text-brand-secondary hover:underline">{v.field_value}</a>
                                        ) : (
                                          v?.field_value || '—'
                                        )}
                                      </div>
                                    </td>
                                  );
                                })}
                                <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">{fmtDate(sub.submitted_at)}</td>
                                <td className="px-4 py-2.5">
                                  <select
                                    value={sub.status_option_id ?? ''}
                                    onChange={e => handleStatusChange(sub, form.id, e.target.value ? Number(e.target.value) : null)}
                                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 hover:border-gray-300 transition-colors"
                                  >
                                    <option value="">— Status —</option>
                                    {statusOptions.map(s => <option key={s.id} value={s.id}>{s.value}</option>)}
                                  </select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        );
      })}

      {/* Expanded form modal */}
      {expandedForm && (
        <ExpandedFormModal
          form={expandedForm}
          conferenceId={conferenceId}
          conferenceName={conferenceName}
          brandLogoUrl={brandLogoUrl}
          attendees={attendees}
          onClose={() => setExpandedForm(null)}
          onSubmitted={() => {
            setLoadedSubmissions(prev => {
              const next = new Set(prev);
              next.delete(expandedForm.id);
              return next;
            });
            loadForms();
          }}
        />
      )}

      {/* Field builder modal */}
      {builderForm && (
        <FormBuilderModal
          title={`Edit Fields — ${builderForm.name}`}
          fields={builderForm.fields}
          canEditTemplateFields={isAdmin}
          onAddField={async (newField) => {
            const res = await fetch(`/api/conference-forms/${builderForm.id}/fields`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...newField, sort_order: builderForm.fields.length + 1 }),
            });
            if (!res.ok) throw new Error();
            toast.success('Field added');
            await loadForms();
          }}
          onUpdateField={async (fieldId, updates) => {
            const field = builderForm.fields.find(f => f.id === fieldId);
            const isTemplate = field?.is_template_field;
            if (isTemplate && isAdmin) {
              const res = await fetch(`/api/form-templates/${builderForm.template_id}/fields/${fieldId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
              });
              if (!res.ok) throw new Error();
            } else if (!isTemplate) {
              const res = await fetch(`/api/conference-forms/${builderForm.id}/fields/${fieldId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
              });
              if (!res.ok) throw new Error();
            }
            toast.success('Field updated');
            await loadForms();
          }}
          onDeleteField={async (fieldId, isTemplate) => {
            if (!confirm('Delete this field?')) return;
            if (isTemplate && isAdmin) {
              const res = await fetch(`/api/form-templates/${builderForm.template_id}/fields/${fieldId}`, { method: 'DELETE' });
              if (!res.ok) throw new Error();
            } else if (!isTemplate) {
              const res = await fetch(`/api/conference-forms/${builderForm.id}/fields/${fieldId}`, { method: 'DELETE' });
              if (!res.ok) throw new Error();
            }
            toast.success('Field removed');
            await loadForms();
          }}
          onReorderFields={async (updates) => {
            await Promise.all(updates.map(({ id, sort_order }) => {
              const field = builderForm.fields.find(f => f.id === id);
              if (field?.is_template_field && isAdmin) {
                return fetch(`/api/form-templates/${builderForm.template_id}/fields/${id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ sort_order }),
                });
              } else if (!field?.is_template_field) {
                return fetch(`/api/conference-forms/${builderForm.id}/fields/${id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ sort_order }),
                });
              }
              return Promise.resolve();
            }));
            loadForms(); // background refresh — no await so UI stays responsive
          }}
          onClose={() => setBuilderFormId(null)}
        />
      )}
    </div>
  );
}

function HtmlEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const editorRef = useRef<HTMLDivElement>(null);

  // Sync initial value to editor on mount only
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = value || '';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (cmd: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val); // execCommand deprecated but broadly supported for basic editing
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    if (html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll<HTMLElement>('*').forEach(el => {
        el.style.background = '';
        el.style.backgroundColor = '';
      });
      document.execCommand('insertHTML', false, doc.body.innerHTML);
    } else {
      document.execCommand('insertText', false, text);
    }
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  const toolbarBtn = (label: string, cmd: string, val?: string, title?: string) => (
    <button
      key={cmd + (val || '')}
      type="button"
      title={title || label}
      onMouseDown={e => { e.preventDefault(); exec(cmd, val); }}
      className="px-2 py-1 text-xs font-medium rounded hover:bg-gray-200 text-gray-700 transition-colors"
    >
      {label}
    </button>
  );

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-0.5 p-1.5 bg-gray-50 border-b border-gray-200">
        {toolbarBtn('B', 'bold', undefined, 'Bold')}
        {toolbarBtn('I', 'italic', undefined, 'Italic')}
        {toolbarBtn('U', 'underline', undefined, 'Underline')}
        <span className="w-px bg-gray-300 mx-1 self-stretch" />
        {toolbarBtn('H2', 'formatBlock', 'h2', 'Heading 2')}
        {toolbarBtn('H3', 'formatBlock', 'h3', 'Heading 3')}
        {toolbarBtn('P', 'formatBlock', 'p', 'Paragraph')}
        <span className="w-px bg-gray-300 mx-1 self-stretch" />
        {toolbarBtn('• List', 'insertUnorderedList', undefined, 'Bullet list')}
        {toolbarBtn('1. List', 'insertOrderedList', undefined, 'Numbered list')}
        <span className="w-px bg-gray-300 mx-1 self-stretch" />
        {toolbarBtn('⬅', 'justifyLeft', undefined, 'Align left')}
        {toolbarBtn('↔', 'justifyCenter', undefined, 'Center')}
        {toolbarBtn('➡', 'justifyRight', undefined, 'Align right')}
        <span className="w-px bg-gray-300 mx-1 self-stretch" />
        {toolbarBtn('✕ Clear', 'removeFormat', undefined, 'Clear formatting')}
      </div>
      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={() => { if (editorRef.current) onChange(editorRef.current.innerHTML); }}
        onPaste={handlePaste}
        className="min-h-[140px] p-3 text-sm outline-none"
        style={{ lineHeight: 1.6 }}
        data-placeholder="Type and format your text here. This content appears in the left panel on landscape/desktop screens."
      />
      <style>{`[data-placeholder]:empty::before { content: attr(data-placeholder); color: #9ca3af; pointer-events: none; }`}</style>
    </div>
  );
}
