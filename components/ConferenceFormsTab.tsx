'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { ExpandedFormModal, type FormField, type ConferenceForm } from './ExpandedFormModal';
import { FormBuilderModal } from './FormBuilderModal';

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

interface UserOption {
  id: number;   // config_options.id
  value: string; // display name
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

// Inline user multi-select for follow-up assignment
function FollowUpPicker({
  sub,
  userOptions,
  defaultUserIds,
  onAssign,
  onCancel,
}: {
  sub: Submission;
  userOptions: UserOption[];
  defaultUserIds: number[];
  onAssign: (userConfigIds: number[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<number[]>(defaultUserIds);
  const [open, setOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const attName = sub.values.find(v => v.field_label === 'Name')?.field_value || 'this attendee';
  const attTitle = sub.values.find(v => v.field_label === 'Title')?.field_value || '';
  const attCo = sub.values.find(v => v.field_label === 'Company')?.field_value || '';
  const label = [attName, attTitle || null, attCo || null].filter(Boolean).join(' – ');

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (id: number) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const displayLabel = selected.length === 0
    ? 'Select user…'
    : selected.length === 1
      ? (userOptions.find(u => u.id === selected[0])?.value ?? 'Unknown')
      : `${selected.length} users`;

  const handleAssign = async () => {
    if (selected.length === 0) { toast.error('Select at least one user'); return; }
    setAssigning(true);
    try {
      await onAssign(selected);
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-500 whitespace-nowrap">Assign to:</span>
      <div ref={dropRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 hover:border-brand-secondary transition-colors flex items-center gap-1.5 whitespace-nowrap"
        >
          {displayLabel}
          <svg className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <div className="absolute z-50 bottom-full mb-1 left-0 min-w-[180px] bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
            {userOptions.map(u => (
              <label key={u.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(u.id)}
                  onChange={() => toggle(u.id)}
                  className="accent-brand-secondary"
                />
                <span>{u.value}</span>
              </label>
            ))}
            {userOptions.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400">No users configured</div>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={handleAssign}
        disabled={assigning || selected.length === 0}
        className="text-xs px-2.5 py-1.5 rounded-lg bg-brand-secondary text-white hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap font-medium"
      >
        {assigning ? 'Assigning…' : 'Assign Follow Up'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

export function ConferenceFormsTab({ conferenceId, conferenceName, attendees, brandLogoUrl, isAdmin, currentUserEmail }: Props) {
  const [forms, setForms] = useState<ConferenceForm[]>([]);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [currentUserConfigId, setCurrentUserConfigId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Add Form state
  const [addingForm, setAddingForm] = useState(false);
  const [newFormName, setNewFormName] = useState('');
  const [newFormTemplate, setNewFormTemplate] = useState<number | null>(null);
  const [newFormLogo, setNewFormLogo] = useState('');
  const [newFormBgColor, setNewFormBgColor] = useState('');
  const [savingNewForm, setSavingNewForm] = useState(false);

  // Expanded form
  const [expandedForm, setExpandedForm] = useState<ConferenceForm | null>(null);

  // Submissions
  const [submissions, setSubmissions] = useState<Record<number, Submission[]>>({});
  const [loadedSubmissions, setLoadedSubmissions] = useState<Set<number>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Follow-up picker: which submission row is showing the picker
  const [followUpOpenId, setFollowUpOpenId] = useState<number | null>(null);
  // Optimistic: submission IDs that have had a follow-up assigned this session
  const [followUpAssigned, setFollowUpAssigned] = useState<Set<number>>(new Set());

  // Builder
  const [builderFormId, setBuilderFormId] = useState<number | null>(null);

  // Edit form settings
  const [editingFormId, setEditingFormId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ name: string; conference_logo_url: string; background_color: string }>({ name: '', conference_logo_url: '', background_color: '' });

  const loadForms = useCallback(async () => {
    try {
      const [formsRes, templatesRes, statusRes, userRes] = await Promise.all([
        fetch(`/api/conference-forms?conference_id=${conferenceId}`),
        fetch('/api/form-templates'),
        fetch('/api/config?category=status'),
        fetch('/api/config?category=user'),
      ]);
      if (formsRes.ok) setForms(await formsRes.json());
      if (templatesRes.ok) setTemplates(await templatesRes.json());
      if (statusRes.ok) {
        const data = await statusRes.json();
        setStatusOptions(data.map((o: { id: number; value: string }) => ({ id: o.id, value: o.value })));
      }
      if (userRes.ok) {
        const data = await userRes.json();
        setUserOptions(data.map((o: { id: number; value: string }) => ({ id: o.id, value: o.value })));
      }
    } catch { toast.error('Failed to load forms'); }
    finally { setLoading(false); }
  }, [conferenceId]);

  useEffect(() => { loadForms(); }, [loadForms]);

  // Fetch current user's config_id for follow-up default selection
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        if (data?.user?.configId) setCurrentUserConfigId(Number(data.user.configId));
      })
      .catch(() => {});
  }, []);

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
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Form created!');
      setAddingForm(false);
      setNewFormName('');
      setNewFormTemplate(null);
      setNewFormLogo('');
      setNewFormBgColor('');
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

  const handleStatusChange = async (submissionId: number, formId: number, optionId: number | null) => {
    try {
      await fetch(`/api/form-submissions/${submissionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_option_id: optionId }),
      });
      const statusOpt = statusOptions.find(s => s.id === optionId);
      setSubmissions(prev => ({
        ...prev,
        [formId]: (prev[formId] || []).map(s =>
          s.id === submissionId ? { ...s, status_option_id: optionId, status_value: statusOpt?.value || null } : s
        ),
      }));
    } catch { toast.error('Failed to update status'); }
  };

  const handleAssignFollowUp = async (submissionId: number, userConfigIds: number[]) => {
    try {
      const res = await fetch(`/api/form-submissions/${submissionId}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_user_config_ids: userConfigIds }),
      });
      if (!res.ok) throw new Error();
      toast.success('Follow-up assigned!');
      setFollowUpOpenId(null);
      setFollowUpAssigned(prev => new Set(prev).add(submissionId));
    } catch { toast.error('Failed to assign follow-up'); }
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
              <label className="block text-xs font-semibold text-gray-500 mb-1">Background Color (hex)</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={newFormBgColor || '#0B3C62'}
                  onChange={e => setNewFormBgColor(e.target.value)}
                  className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5 bg-white"
                />
                <input type="text" value={newFormBgColor} onChange={e => setNewFormBgColor(e.target.value)} className="input-field text-sm flex-1" placeholder="#0B3C62" />
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
              <div className="p-4 space-y-4 bg-blue-50/20 border-b border-gray-100">
                <h3 className="text-sm font-bold text-brand-primary">Edit Form Settings</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Form Name</label>
                    <input type="text" value={editDraft.name} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))} className="input-field text-sm w-full" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Conference Logo URL</label>
                    <input type="url" value={editDraft.conference_logo_url} onChange={e => setEditDraft(d => ({ ...d, conference_logo_url: e.target.value }))} className="input-field text-sm w-full" placeholder="https://..." />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Background Color</label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={editDraft.background_color || '#0B3C62'} onChange={e => setEditDraft(d => ({ ...d, background_color: e.target.value }))} className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5 bg-white" />
                      <input type="text" value={editDraft.background_color} onChange={e => setEditDraft(d => ({ ...d, background_color: e.target.value }))} className="input-field text-sm flex-1" />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => handleSaveEditForm(form.id)} className="btn-primary text-xs px-3 py-1.5">Save</button>
                  <button type="button" onClick={() => setEditingFormId(null)} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4 px-5 py-4 border-b border-gray-100">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-gray-800">{form.name}</h3>
                    <span className="text-xs text-gray-400">by {form.created_by || '—'}</span>
                    <span className="text-xs text-gray-400">· {fmtDate(form.created_at)}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">{form.submission_count ?? 0} submissions</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Export */}
                  <button
                    type="button"
                    onClick={() => { loadSubmissions(form.id); setTimeout(() => handleExport(form), 300); }}
                    title="Export to Excel"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
                  </button>
                  {/* Edit form settings */}
                  <button
                    type="button"
                    onClick={() => { setEditingFormId(form.id); setEditDraft({ name: form.name, conference_logo_url: form.conference_logo_url || '', background_color: form.background_color || '' }); }}
                    title="Edit form settings"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-brand-secondary hover:bg-blue-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </button>
                  {/* Build / add fields */}
                  <button
                    type="button"
                    onClick={() => setBuilderFormId(form.id)}
                    title="Add/edit fields"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-brand-secondary hover:bg-blue-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  </button>
                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => handleDeleteForm(form.id)}
                    title="Delete form"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                  {/* Expand form */}
                  <button
                    type="button"
                    onClick={() => setExpandedForm(form)}
                    className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                    Expand Form
                  </button>
                  {/* Toggle submissions */}
                  <button
                    type="button"
                    onClick={() => toggleRow(form.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"
                    title={isExpanded ? 'Collapse' : 'Show submissions'}
                  >
                    <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Submissions table */}
            {isExpanded && (
              <div className="overflow-x-auto">
                {subs.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-400">No submissions yet.</div>
                ) : (
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
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Follow Up</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {subs.map(sub => {
                        const nameVal = sub.values.find(v => v.field_label === 'Name')?.field_value || '—';
                        const isFollowUpOpen = followUpOpenId === sub.id;
                        const isAssigned = followUpAssigned.has(sub.id);
                        const defaultUsers = currentUserConfigId ? [currentUserConfigId] : [];

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
                                onChange={e => handleStatusChange(sub.id, form.id, e.target.value ? Number(e.target.value) : null)}
                                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 hover:border-gray-300 transition-colors"
                              >
                                <option value="">— Status —</option>
                                {statusOptions.map(s => <option key={s.id} value={s.id}>{s.value}</option>)}
                              </select>
                            </td>
                            <td className="px-4 py-2.5 min-w-[200px]">
                              {isAssigned ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold whitespace-nowrap">
                                  Follow Up
                                  <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                  </svg>
                                </span>
                              ) : isFollowUpOpen ? (
                                <FollowUpPicker
                                  sub={sub}
                                  userOptions={userOptions}
                                  defaultUserIds={defaultUsers}
                                  onAssign={ids => handleAssignFollowUp(sub.id, ids)}
                                  onCancel={() => setFollowUpOpenId(null)}
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setFollowUpOpenId(sub.id)}
                                  className="text-xs px-2.5 py-1.5 rounded-lg border border-brand-secondary text-brand-secondary hover:bg-blue-50 transition-colors whitespace-nowrap font-medium"
                                >
                                  + Follow Up
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
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
          onClose={() => setBuilderFormId(null)}
        />
      )}
    </div>
  );
}
