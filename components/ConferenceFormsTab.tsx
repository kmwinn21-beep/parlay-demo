'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { ExpandedFormModal, buildAccentBackground, type FormField, type ConferenceForm } from './ExpandedFormModal';
import { FormBuilderModal } from './FormBuilderModal';
import { useUser } from './UserContext';
import { useConfigColors } from '@/lib/useConfigColors';
import { getBadgeClass } from '@/lib/colors';

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
  company_type: string | null;
  submitted_at: string;
  status_option_id: number | null;
  status_value: string | null;
  submission_source: string;
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
  isAdmin: boolean;
  currentUserEmail: string;
}

function fmtDate(d?: string) {
  if (!d) return '—';
  try {
    return new Date(d.includes('Z') ? d : d + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return '—'; }
}

function SubTypePill({ source }: { source: string }) {
  const isPublic = source === 'public_link';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${isPublic ? 'bg-purple-50 text-purple-600' : 'bg-gray-100 text-gray-600'}`}>
      {isPublic ? 'Form Link' : 'Manual'}
    </span>
  );
}

export function ConferenceFormsTab({ conferenceId, conferenceName, attendees, isAdmin, currentUserEmail }: Props) {
  const { user } = useUser();
  const colorMaps = useConfigColors();
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
    panel_logo_url: string;
  }>({ name: '', conference_logo_url: '', background_color: '', accent_color: '', accent_gradient: 'none', panel_logo_url: '' });

  // Duplicate form → other conference(s)
  const [duplicatingFormId, setDuplicatingFormId] = useState<number | null>(null);
  const [dupDropPos, setDupDropPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const [conferenceOptions, setConferenceOptions] = useState<{ id: number; name: string }[] | null>(null);
  const [selectedDupConfs, setSelectedDupConfs] = useState<Set<number>>(new Set());
  const [duplicating, setDuplicating] = useState(false);
  const dupDropRef = useRef<HTMLDivElement>(null);

  // Public link
  const [publicLinkFormId, setPublicLinkFormId] = useState<number | null>(null);
  const [publicLinkDropPos, setPublicLinkDropPos] = useState<{ top: number; left: number } | null>(null);
  const [togglingPublic, setTogglingPublic] = useState(false);
  const publicLinkDropRef = useRef<HTMLDivElement>(null);

  const openPublicLinkDropdown = useCallback((formId: number, anchor: HTMLElement) => {
    const buttonRect = anchor.getBoundingClientRect();
    const cardRect = (anchor.closest('.card') ?? anchor).getBoundingClientRect();
    const width = 300;
    const margin = 12;
    let left = buttonRect.right + 8;
    if (left + width + margin > window.innerWidth) left = buttonRect.left - width - 8;
    setPublicLinkDropPos({ top: cardRect.top, left: Math.max(margin, left) });
    setPublicLinkFormId(prev => (prev === formId ? null : formId));
  }, []);

  useEffect(() => {
    if (publicLinkFormId === null) return;
    const handler = (e: MouseEvent) => {
      if (publicLinkDropRef.current && !publicLinkDropRef.current.contains(e.target as Node)) setPublicLinkFormId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [publicLinkFormId]);

  // Email / Notes field popovers (submissions table)
  const [fieldPopover, setFieldPopover] = useState<{ key: string; mode: 'email' | 'notes'; value: string } | null>(null);
  const [fieldPopoverPos, setFieldPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const fieldPopoverRef = useRef<HTMLDivElement>(null);

  const openFieldPopover = useCallback((anchor: HTMLElement, key: string, mode: 'email' | 'notes', value: string) => {
    const rect = anchor.getBoundingClientRect();
    const width = 260;
    const margin = 12;
    let left = rect.left;
    if (left + width + margin > window.innerWidth) left = window.innerWidth - width - margin;
    setFieldPopoverPos({ top: rect.bottom + 6, left: Math.max(margin, left) });
    setFieldPopover(prev => (prev?.key === key ? null : { key, mode, value }));
  }, []);

  useEffect(() => {
    if (!fieldPopover) return;
    const handler = (e: MouseEvent) => {
      if (fieldPopoverRef.current && !fieldPopoverRef.current.contains(e.target as Node)) setFieldPopover(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [fieldPopover]);

  const handleCopyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success('Email copied');
    } catch {
      toast.error('Failed to copy email');
    }
  };

  const openDuplicateDropdown = useCallback(async (formId: number, anchor: HTMLElement) => {
    const buttonRect = anchor.getBoundingClientRect();
    const cardRect = (anchor.closest('.card') ?? anchor).getBoundingClientRect();
    const width = 260;
    const margin = 12;
    let left = buttonRect.right + 8;
    // Flip to the left of the button if there isn't room on the right
    if (left + width + margin > window.innerWidth) left = buttonRect.left - width - 8;
    const top = cardRect.top;
    setDupDropPos({
      top,
      left: Math.max(margin, left),
      maxHeight: Math.max(180, window.innerHeight - top - margin),
    });
    setDuplicatingFormId(prev => (prev === formId ? null : formId));
    setSelectedDupConfs(new Set());
    if (conferenceOptions === null) {
      try {
        const res = await fetch('/api/conferences?nav=1');
        if (res.ok) {
          const data = await res.json();
          setConferenceOptions(data.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })));
        }
      } catch { toast.error('Failed to load conferences'); }
    }
  }, [conferenceOptions]);

  useEffect(() => {
    if (duplicatingFormId === null) return;
    const handler = (e: MouseEvent) => {
      if (dupDropRef.current && !dupDropRef.current.contains(e.target as Node)) setDuplicatingFormId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [duplicatingFormId]);

  const handleDuplicateForm = async (formId: number) => {
    if (selectedDupConfs.size === 0) { toast.error('Select at least one conference'); return; }
    setDuplicating(true);
    try {
      const res = await fetch(`/api/conference-forms/${formId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conference_ids: Array.from(selectedDupConfs) }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Duplicated to ${selectedDupConfs.size} conference${selectedDupConfs.size > 1 ? 's' : ''}`);
      setDuplicatingFormId(null);
      setSelectedDupConfs(new Set());
      if (selectedDupConfs.has(conferenceId)) await loadForms();
    } catch {
      toast.error('Failed to duplicate form');
    } finally {
      setDuplicating(false);
    }
  };

  const handleTogglePublic = async (form: ConferenceForm) => {
    setTogglingPublic(true);
    try {
      const res = await fetch(`/api/conference-forms/${form.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: !form.is_public }),
      });
      if (!res.ok) throw new Error();
      await loadForms();
    } catch {
      toast.error('Failed to update public link');
    } finally {
      setTogglingPublic(false);
    }
  };

  const publicFormUrl = (form: ConferenceForm) => {
    if (!form.public_token) return '';
    const aid = user?.accountId || 'master';
    return `${window.location.origin}/forms?token=${form.public_token}&aid=${aid}`;
  };

  const handleCopyPublicLink = async (form: ConferenceForm) => {
    try {
      await navigator.clipboard.writeText(publicFormUrl(form));
      toast.success('Link copied');
    } catch {
      toast.error('Failed to copy link');
    }
  };

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
        // Match by field_id first — field_label is a point-in-time snapshot at submission,
        // so it goes stale (and stops matching) if the field's label is ever renamed later.
        const v = sub.values.find(vv => vv.field_id === f.id) ?? sub.values.find(vv => vv.field_label === f.label);
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
          panel_logo_url: editDraft.panel_logo_url.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Saved');
      setEditingFormId(null);
      await loadForms();
    } catch { toast.error('Failed to save'); }
  };

  const isCompanyField = (f: FormField) => f.field_key === 'company' || f.label.toLowerCase() === 'company';

  // "Unknown" whenever there's no matched attendee (or that attendee has no company/type
  // on file) — otherwise the same colored pill used for company type elsewhere in the app.
  const renderCompanyTypePill = (sub: Submission) => {
    const typeValue = sub.attendee_id && sub.company_type ? sub.company_type : null;
    return (
      <span className={getBadgeClass(typeValue || undefined, colorMaps.company_type || {})}>
        {typeValue || 'Unknown'}
      </span>
    );
  };

  // Shared by the mobile-card and desktop-table submission rows: company links stay as
  // before, email/notes fields collapse to an icon that opens a small popover instead of
  // showing (and truncating) the raw text inline.
  const renderFieldValue = (f: FormField, sub: Submission, key: string) => {
    // Match by field_id first — field_label is a point-in-time snapshot at submission, so
    // it goes stale (and stops matching) if the field's label is ever renamed later.
    const v = sub.values.find(vv => vv.field_id === f.id) ?? sub.values.find(vv => vv.field_label === f.label);
    const isCompany = isCompanyField(f);
    const isEmail = f.field_key === 'email' || f.label.toLowerCase().includes('email');
    const isNotes = f.field_key === 'notes' || f.label.toLowerCase().includes('note');

    if (isEmail) {
      if (!v?.field_value) return <span className="text-gray-400">—</span>;
      return (
        <button
          type="button"
          onClick={e => openFieldPopover(e.currentTarget, key, 'email', v.field_value)}
          title={v.field_value}
          className="w-7 h-7 rounded-full bg-green-50 text-green-600 flex items-center justify-center hover:bg-green-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
        </button>
      );
    }
    if (isNotes) {
      if (!v?.field_value) return <span className="text-gray-400">—</span>;
      return (
        <button
          type="button"
          onClick={e => openFieldPopover(e.currentTarget, key, 'notes', v.field_value)}
          title="View note"
          className="w-7 h-7 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center hover:bg-blue-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        </button>
      );
    }
    if (isCompany && sub.company_id && v?.field_value) {
      return <a href={`/companies/${sub.company_id}`} className="text-brand-secondary hover:underline">{v.field_value}</a>;
    }
    return <>{v?.field_value || '—'}</>;
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
                <input type="color" value={newFormBgColor || getCssVarHex('--brand-primary-rgb', '#0B3C62')} onChange={e => setNewFormBgColor(e.target.value)} className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5 bg-white" />
                <input type="text" value={newFormBgColor} onChange={e => setNewFormBgColor(e.target.value)} className="input-field text-sm flex-1" placeholder="(default brand primary)" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Page Background Color</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={newFormAccentColor || getCssVarHex('--brand-highlight-rgb', '#FFCB3F')} onChange={e => setNewFormAccentColor(e.target.value)} className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5 bg-white" />
                <input type="text" value={newFormAccentColor} onChange={e => setNewFormAccentColor(e.target.value)} className="input-field text-sm flex-1" placeholder="(default brand gold)" />
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

                {/* Row 1: Name */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Form Name</label>
                  <input type="text" value={editDraft.name} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))} className="input-field text-sm w-full" />
                </div>

                {/* Row 1b: Logos */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">
                      Left Panel Logo URL
                      <span className="font-normal text-gray-400 ml-1">(landscape top-left corner)</span>
                    </label>
                    <input
                      type="url"
                      value={editDraft.panel_logo_url}
                      onChange={e => setEditDraft(d => ({ ...d, panel_logo_url: e.target.value }))}
                      className="input-field text-sm w-full"
                      placeholder="https://..."
                    />
                    {editDraft.panel_logo_url && (
                      <img src={editDraft.panel_logo_url} alt="Panel logo preview" className="mt-2 h-8 w-auto object-contain rounded border border-gray-200" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">
                      Conference Logo URL
                      <span className="font-normal text-gray-400 ml-1">(inside form card)</span>
                    </label>
                    <input type="url" value={editDraft.conference_logo_url} onChange={e => setEditDraft(d => ({ ...d, conference_logo_url: e.target.value }))} className="input-field text-sm w-full" placeholder="https://..." />
                    {editDraft.conference_logo_url && (
                      <img src={editDraft.conference_logo_url} alt="Conference logo preview" className="mt-2 h-8 w-auto object-contain rounded border border-gray-200" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    )}
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

                <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
                  Images, text blocks, and the form&apos;s size/position are now edited directly on the canvas — click <strong>Expand Form</strong>, then <strong>Edit Form</strong> in the bottom-left corner.
                </p>

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
                          panel_logo_url: form.panel_logo_url || '',
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
                    {/* Duplicate to another conference */}
                    <button
                      type="button"
                      onClick={e => openDuplicateDropdown(form.id, e.currentTarget)}
                      title="Duplicate form to another conference"
                      className="p-2 rounded-lg text-gray-400 hover:text-brand-secondary hover:bg-blue-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    </button>
                    {duplicatingFormId === form.id && dupDropPos && createPortal(
                      <div
                        ref={dupDropRef}
                        className="fixed z-[10000] w-64 bg-white border border-gray-200 rounded-lg shadow-xl flex flex-col"
                        style={{ top: dupDropPos.top, left: dupDropPos.left, maxHeight: dupDropPos.maxHeight }}
                      >
                        <p className="flex-shrink-0 px-3 py-2 text-xs font-semibold text-gray-500 border-b border-gray-100">Duplicate to conference(s)</p>
                        <div className="flex-1 min-h-0 overflow-y-auto">
                          {conferenceOptions === null && (
                            <div className="px-3 py-3 text-xs text-gray-400">Loading…</div>
                          )}
                          {conferenceOptions?.length === 0 && (
                            <div className="px-3 py-3 text-xs text-gray-400">No conferences found</div>
                          )}
                          {conferenceOptions?.map(c => (
                            <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedDupConfs.has(c.id)}
                                onChange={e => {
                                  setSelectedDupConfs(prev => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(c.id); else next.delete(c.id);
                                    return next;
                                  });
                                }}
                                className="accent-brand-secondary flex-shrink-0"
                              />
                              <span className="truncate">{c.name}</span>
                            </label>
                          ))}
                        </div>
                        <div className="flex-shrink-0 flex gap-2 px-3 py-2 border-t border-gray-100">
                          <button
                            type="button"
                            onClick={() => handleDuplicateForm(form.id)}
                            disabled={duplicating || selectedDupConfs.size === 0}
                            className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                          >
                            {duplicating ? 'Duplicating…' : `Duplicate${selectedDupConfs.size > 0 ? ` (${selectedDupConfs.size})` : ''}`}
                          </button>
                          <button type="button" onClick={() => setDuplicatingFormId(null)} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
                        </div>
                      </div>,
                      document.body
                    )}
                    {/* Public self-serve link */}
                    <button
                      type="button"
                      onClick={e => openPublicLinkDropdown(form.id, e.currentTarget)}
                      title="Public link"
                      className={`p-2 rounded-lg transition-colors ${form.is_public ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:text-brand-secondary hover:bg-blue-50'}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-4 4a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l4-4a4 4 0 015.656 5.656l-1.5 1.5" /></svg>
                    </button>
                    {publicLinkFormId === form.id && publicLinkDropPos && createPortal(
                      <div
                        ref={publicLinkDropRef}
                        className="fixed z-[10000] w-[300px] bg-white border border-gray-200 rounded-lg shadow-xl"
                        style={{ top: publicLinkDropPos.top, left: publicLinkDropPos.left }}
                      >
                        <p className="px-3 py-2 text-xs font-semibold text-gray-500 border-b border-gray-100">Public Link</p>
                        <div className="p-3 space-y-3">
                          <label className="flex items-center justify-between gap-2 cursor-pointer">
                            <span className="text-sm text-gray-700">Anyone with the link can submit</span>
                            <button
                              type="button"
                              onClick={() => handleTogglePublic(form)}
                              disabled={togglingPublic}
                              className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${form.is_public ? 'bg-green-500' : 'bg-gray-300'} disabled:opacity-50`}
                            >
                              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.is_public ? 'translate-x-4' : ''}`} />
                            </button>
                          </label>
                          {form.is_public && form.public_token && (
                            <div className="flex gap-1.5">
                              <input type="text" readOnly value={publicFormUrl(form)} onFocus={e => e.target.select()} className="input-field text-xs flex-1 truncate" />
                              <button type="button" onClick={() => handleCopyPublicLink(form)} className="btn-secondary text-xs px-2.5 flex-shrink-0">Copy</button>
                            </div>
                          )}
                          <p className="text-xs text-gray-400">
                            No sign-in required. Submitters enter their own name, title, and company by hand.
                          </p>
                        </div>
                      </div>,
                      document.body
                    )}
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
                                  <a href={`/attendees/${sub.attendee_id}`} className="font-semibold text-xs text-brand-secondary hover:underline leading-snug block">{nameVal}</a>
                                ) : (
                                  <p className="font-semibold text-xs text-gray-800 leading-snug">{nameVal}</p>
                                )}
                                <p className="text-xs text-gray-400 mt-0.5">{sub.conference_name}</p>
                              </div>
                              <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">{fmtDate(sub.submitted_at)}</span>
                            </div>
                            {/* Field values grid */}
                            {dataFields.length > 0 && (
                              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                {dataFields.map(f => (
                                  <Fragment key={f.id}>
                                    <div>
                                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{f.label}</p>
                                      <div className="text-xs text-gray-700 truncate">
                                        {renderFieldValue(f, sub, `m-${sub.id}-${f.id}`)}
                                      </div>
                                    </div>
                                    {isCompanyField(f) && (
                                      <div>
                                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</p>
                                        <div className="text-xs truncate">{renderCompanyTypePill(sub)}</div>
                                      </div>
                                    )}
                                  </Fragment>
                                ))}
                              </div>
                            )}
                            {/* Submission type + Status */}
                            <div className="pt-1 border-t border-gray-100 flex items-center justify-between gap-2">
                              <SubTypePill source={sub.submission_source} />
                              <select
                                value={sub.status_option_id ?? ''}
                                onChange={e => handleStatusChange(sub, form.id, e.target.value ? Number(e.target.value) : null)}
                                className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 hover:border-gray-300 transition-colors"
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
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Conference</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Name</th>
                            {dataFields.map(f => (
                              <Fragment key={f.id}>
                                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{f.label}</th>
                                {isCompanyField(f) && (
                                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Type</th>
                                )}
                              </Fragment>
                            ))}
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Submitted</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Sub. Type</th>
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
                                {dataFields.map(f => (
                                  <Fragment key={f.id}>
                                    <td className="px-4 py-2.5 text-gray-700 max-w-xs">
                                      <div className="truncate">
                                        {renderFieldValue(f, sub, `d-${sub.id}-${f.id}`)}
                                      </div>
                                    </td>
                                    {isCompanyField(f) && (
                                      <td className="px-4 py-2.5 whitespace-nowrap">{renderCompanyTypePill(sub)}</td>
                                    )}
                                  </Fragment>
                                ))}
                                <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">{fmtDate(sub.submitted_at)}</td>
                                <td className="px-4 py-2.5 whitespace-nowrap">
                                  <SubTypePill source={sub.submission_source} />
                                </td>
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
          onFormUpdated={(patch) => {
            setForms(prev => prev.map(f => f.id === expandedForm.id ? { ...f, ...patch } : f));
            setExpandedForm(prev => prev ? { ...prev, ...patch } : prev);
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

      {/* Email / Notes field popover */}
      {fieldPopover && fieldPopoverPos && createPortal(
        <div
          ref={fieldPopoverRef}
          className="fixed z-[10000] w-[260px] bg-white border border-gray-200 rounded-lg shadow-xl p-3"
          style={{ top: fieldPopoverPos.top, left: fieldPopoverPos.left }}
        >
          {fieldPopover.mode === 'email' ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-800 break-all">{fieldPopover.value}</p>
              <button
                type="button"
                onClick={() => handleCopyEmail(fieldPopover.value)}
                className="btn-secondary text-xs px-2.5 py-1.5 w-full"
              >
                Copy Email
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-700 whitespace-pre-wrap">{fieldPopover.value}</p>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
