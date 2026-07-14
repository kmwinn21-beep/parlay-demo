'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Rnd } from 'react-rnd';
import { useEditor } from '@tiptap/react';
import toast from 'react-hot-toast';
import { compressImage } from './DashboardActionCard';
import { RichTextEditor, getEditorExtensions } from './RichTextEditor';
import { FormEditDrawer } from './FormEditDrawer';

export interface FormField {
  id: number;
  field_type: string;
  field_key: string | null;
  label: string;
  placeholder: string | null;
  required: boolean;
  sort_order: number;
  options_source: string | null;
  options: { id: number; value: string; sort_order: number }[];
  is_template_field?: boolean;
}

export interface ConferenceForm {
  id: number;
  name: string;
  conference_logo_url: string | null;
  background_color: string | null;
  accent_color: string | null;
  accent_gradient: string | null;
  image_url: string | null;
  image_max_width: number | null;
  html_content: string | null;
  image_offset_y: number | null;
  html_offset_y: number | null;
  form_width: number | null;
  form_height: number | null;
  form_offset_y: number | null;
  form_x: number | null;
  form_z_index: number;
  background_image_url: string | null;
  background_image_opacity: number | null;
  background_video_url: string | null;
  background_video_opacity: number | null;
  eyebrow_color: string | null;
  submit_button_color: string | null;
  panel_logo_url: string | null;
  created_by: string | null;
  created_at: string;
  fields: FormField[];
  submission_count?: number;
  template_id?: number | null;
}

interface FormElement {
  id: number;
  conference_form_id: number;
  element_type: 'image' | 'text' | 'video';
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  content: string | null;
  object_fit: 'contain' | 'cover';
  focal_x: number;
  focal_y: number;
}

interface AttendeeOption {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
  company_name?: string;
  email?: string;
}

interface Props {
  form: ConferenceForm;
  conferenceId: number;
  conferenceName: string;
  attendees: AttendeeOption[];
  onClose: () => void;
  onSubmitted: () => void;
  onFormUpdated?: (patch: Partial<ConferenceForm>) => void;
}

function adjustHex(hex: string, amount: number): string {
  const clean = (hex || '#808080').replace('#', '').padEnd(6, '0');
  const r = Math.min(255, Math.max(0, Math.round(parseInt(clean.slice(0, 2), 16) + amount * 255)));
  const g = Math.min(255, Math.max(0, Math.round(parseInt(clean.slice(2, 4), 16) + amount * 255)));
  const b = Math.min(255, Math.max(0, Math.round(parseInt(clean.slice(4, 6), 16) + amount * 255)));
  return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('');
}

export function buildAccentBackground(color: string, gradient: string | null): string {
  const c = color || '#FFCB3F';
  switch (gradient) {
    case 'radial-light':
      return `radial-gradient(ellipse at center, ${adjustHex(c, 0.25)} 0%, ${c} 100%)`;
    case 'radial-dark':
      return `radial-gradient(ellipse at center, ${c} 0%, ${adjustHex(c, -0.2)} 100%)`;
    case 'linear-top':
      return `linear-gradient(to bottom, ${adjustHex(c, 0.2)} 0%, ${c} 100%)`;
    case 'linear-bottom':
      return `linear-gradient(to bottom, ${c} 0%, ${adjustHex(c, -0.2)} 100%)`;
    default:
      return c;
  }
}

function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/\s+on\w+="[^"]*"/gi, '')
      .replace(/\s+on\w+='[^']*'/gi, '')
      .replace(/javascript:/gi, '');
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script').forEach(el => el.remove());
  doc.querySelectorAll<HTMLElement>('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on') || attr.value.toLowerCase().includes('javascript:')) {
        el.removeAttribute(attr.name);
      }
    });
    el.style.background = '';
    el.style.backgroundColor = '';
  });
  return doc.body.innerHTML;
}

function isColorLight(hex: string): boolean {
  const c = (hex || '#000000').replace('#', '').padEnd(6, '0');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

function MediaElementCanvas({ src, mediaType, objectFit, focalX, focalY, isEditMode, onFocalCommit }: {
  src: string;
  mediaType: 'image' | 'video';
  objectFit: 'contain' | 'cover';
  focalX: number;
  focalY: number;
  isEditMode: boolean;
  onFocalCommit: (x: number, y: number) => void;
}) {
  const [error, setError] = useState(false);
  const [localFocal, setLocalFocal] = useState({ x: focalX, y: focalY });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ clientX: number; clientY: number; startX: number; startY: number; curX: number; curY: number } | null>(null);

  // Sync from server once persisted — but not mid-drag, or the commit would snap back
  useEffect(() => { if (!isDragging) setLocalFocal({ x: focalX, y: focalY }); }, [focalX, focalY, isDragging]);

  const cropMode = objectFit === 'cover' && isEditMode;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!cropMode) return;
    e.stopPropagation();
    dragRef.current = { clientX: e.clientX, clientY: e.clientY, startX: localFocal.x, startY: localFocal.y, curX: localFocal.x, curY: localFocal.y };
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dxPct = ((e.clientX - dragRef.current.clientX) / rect.width) * 100;
      const dyPct = ((e.clientY - dragRef.current.clientY) / rect.height) * 100;
      // Dragging right/down reveals more of the left/top of the image → focal point moves opposite to the drag
      const nextX = Math.max(0, Math.min(100, dragRef.current.startX - dxPct));
      const nextY = Math.max(0, Math.min(100, dragRef.current.startY - dyPct));
      dragRef.current.curX = nextX;
      dragRef.current.curY = nextY;
      setLocalFocal({ x: nextX, y: nextY });
    };
    const handleUp = () => {
      setIsDragging(false);
      if (dragRef.current) onFocalCommit(Math.round(dragRef.current.curX), Math.round(dragRef.current.curY));
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  if (!src || error) {
    return (
      <div className="w-full h-full rounded-xl flex items-center justify-center border-2 border-dashed border-white/30 text-white/40">
        <span className="text-sm font-semibold tracking-wide">{mediaType === 'video' ? 'Video' : 'Image'}</span>
      </div>
    );
  }
  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      className="relative w-full h-full overflow-hidden rounded-xl"
      style={{ cursor: cropMode ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
    >
      {mediaType === 'video' ? (
        <video
          src={src}
          onError={() => setError(true)}
          className="w-full h-full"
          style={{ objectFit, objectPosition: `${localFocal.x}% ${localFocal.y}%`, pointerEvents: isEditMode ? 'none' : 'auto' }}
          controls={!isEditMode}
          playsInline
        />
      ) : (
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => setError(true)}
          className="w-full h-full pointer-events-none"
          style={{ objectFit, objectPosition: `${localFocal.x}% ${localFocal.y}%` }}
        />
      )}
      {cropMode && !isDragging && (
        <div className="absolute bottom-1.5 right-1.5 text-[10px] text-white/80 bg-black/45 rounded px-1.5 py-0.5 pointer-events-none">
          drag to reposition
        </div>
      )}
    </div>
  );
}

function TextElementCanvas({ element, isEditMode, textColor, onChange }: {
  element: FormElement;
  isEditMode: boolean;
  textColor: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions: getEditorExtensions(),
    content: element.content || '<p></p>',
    editorProps: { attributes: { class: 'prose prose-sm max-w-none outline-none h-full overflow-y-auto px-2 py-1' } },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    immediatelyRender: false,
  });

  if (isEditMode) {
    return <div className="w-full h-full overflow-hidden rounded-xl bg-white"><RichTextEditor editor={editor} minHeight="100%" /></div>;
  }
  return (
    <div
      className="prose prose-sm max-w-none h-full overflow-y-auto px-2 py-1"
      style={{ color: textColor }}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(element.content || '') }}
    />
  );
}

type FieldValues = Record<number | string, string | string[]>;

export function ExpandedFormModal({ form, conferenceId, conferenceName, attendees, onClose, onSubmitted, onFormUpdated }: Props) {
  const [values, setValues] = useState<FieldValues>({});
  const [isOther, setIsOther] = useState(false);
  const [manualFirst, setManualFirst] = useState('');
  const [manualLast, setManualLast] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [attendeeDropOpen, setAttendeeDropOpen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanBanner, setScanBanner] = useState(false);
  const [scanCompanyMatches, setScanCompanyMatches] = useState<{ id: number; name: string }[]>([]);
  const [lastScanResult, setLastScanResult] = useState<{
    title: string | null; company: string | null; email: string | null; phone: string | null;
  } | null>(null);
  const attendeeDropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Canvas edit mode: free-position/resize elements + the form card itself ──
  const [isEditMode, setIsEditMode] = useState(false);
  const [elements, setElements] = useState<FormElement[]>([]);
  const [formMeta, setFormMeta] = useState({
    name: form.name,
    background_color: form.background_color || '#0B3C62',
    accent_color: form.accent_color || '#FFCB3F',
    accent_gradient: form.accent_gradient,
    form_x: form.form_x,
    form_offset_y: form.form_offset_y,
    form_width: form.form_width ?? 420,
    form_height: form.form_height ?? 560,
    form_z_index: form.form_z_index ?? 1000,
    background_image_url: form.background_image_url,
    background_image_opacity: form.background_image_opacity ?? 100,
    background_video_url: form.background_video_url,
    background_video_opacity: form.background_video_opacity ?? 100,
    eyebrow_color: form.eyebrow_color,
    submit_button_color: form.submit_button_color,
  });
  const metaTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const elementTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    fetch(`/api/conference-forms/${form.id}/elements`)
      .then(r => r.ok ? r.json() : [])
      .then(setElements)
      .catch(() => {});
  }, [form.id]);

  const patchFormMeta = useCallback((patch: Partial<typeof formMeta>, debounceKey?: string) => {
    setFormMeta(prev => ({ ...prev, ...patch }));
    onFormUpdated?.(patch);
    const run = () => {
      fetch(`/api/conference-forms/${form.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }).catch(() => {});
    };
    if (debounceKey) {
      clearTimeout(metaTimers.current[debounceKey]);
      metaTimers.current[debounceKey] = setTimeout(run, 800);
    } else {
      run();
    }
  }, [form.id, onFormUpdated]);

  const updateElement = useCallback((id: number, patch: Partial<FormElement>, opts?: { debounce?: boolean }) => {
    setElements(prev => prev.map(e => (e.id === id ? { ...e, ...patch } : e)));
    const run = () => {
      fetch(`/api/conference-forms/${form.id}/elements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }).catch(() => {});
    };
    if (opts?.debounce) {
      clearTimeout(elementTimers.current[id]);
      elementTimers.current[id] = setTimeout(run, 800);
    } else {
      run();
    }
  }, [form.id]);

  const removeElement = useCallback((id: number) => {
    setElements(prev => prev.filter(e => e.id !== id));
    fetch(`/api/conference-forms/${form.id}/elements/${id}`, { method: 'DELETE' }).catch(() => {});
  }, [form.id]);

  // Unified layering stack: the form card is just another item alongside the image/text
  // elements, so it can be sent behind or brought in front of them too.
  const reorderStack = useCallback((target: { kind: 'element' | 'form'; id: number | 'form' }, action: 'front' | 'forward' | 'backward' | 'back') => {
    type StackItem = { kind: 'element' | 'form'; id: number | 'form'; z: number };
    const stack: StackItem[] = [
      ...elements.map(e => ({ kind: 'element' as const, id: e.id, z: e.z_index })),
      { kind: 'form' as const, id: 'form' as const, z: formMeta.form_z_index },
    ].sort((a, b) => a.z - b.z);
    const idx = stack.findIndex(s => s.kind === target.kind && s.id === target.id);
    if (idx === -1) return;
    if (action === 'front') {
      const [item] = stack.splice(idx, 1);
      stack.push(item);
    } else if (action === 'back') {
      const [item] = stack.splice(idx, 1);
      stack.unshift(item);
    } else if (action === 'forward' && idx < stack.length - 1) {
      [stack[idx], stack[idx + 1]] = [stack[idx + 1], stack[idx]];
    } else if (action === 'backward' && idx > 0) {
      [stack[idx], stack[idx - 1]] = [stack[idx - 1], stack[idx]];
    }
    stack.forEach((item, z) => {
      if (item.z === z) return;
      if (item.kind === 'form') {
        patchFormMeta({ form_z_index: z });
      } else {
        setElements(prev => prev.map(e => (e.id === item.id ? { ...e, z_index: z } : e)));
        fetch(`/api/conference-forms/${form.id}/elements/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ z_index: z }),
        }).catch(() => {});
      }
    });
  }, [elements, formMeta.form_z_index, form.id, patchFormMeta]);

  const addElement = useCallback(async (element_type: 'image' | 'text' | 'video', content: string) => {
    const base = {
      element_type,
      x: 60, y: 60,
      width: element_type === 'text' ? 280 : 300,
      height: element_type === 'text' ? 180 : 220,
      z_index: elements.length,
      content,
    };
    try {
      const res = await fetch(`/api/conference-forms/${form.id}/elements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(base),
      });
      if (!res.ok) throw new Error();
      const { id } = await res.json();
      setElements(prev => [...prev, { ...base, id, conference_form_id: form.id, object_fit: 'contain', focal_x: 50, focal_y: 50 }]);
    } catch {
      toast.error('Failed to add element');
    }
  }, [form.id, elements.length]);

  // Portal SSR safety — document.body is only available client-side
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape) and (min-width: 768px)');
    setIsLandscape(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsLandscape(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Lock body + html scroll to cover full viewport while form is open
  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (attendeeDropRef.current && !attendeeDropRef.current.contains(e.target as Node)) {
        setAttendeeDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const setValue = useCallback((fieldId: number | string, val: string | string[]) => {
    setValues(prev => ({ ...prev, [fieldId]: val }));
  }, []);

  const handleAttendeeSelect = useCallback((attendee: AttendeeOption | null) => {
    if (!attendee) {
      setIsOther(true);
      setAttendeeSearch('Other');
      setAttendeeDropOpen(false);
      if (lastScanResult) {
        form.fields.forEach(f => {
          if (f.field_key === 'title')   setValue(f.id, lastScanResult.title   ?? '');
          if (f.field_key === 'company') setValue(f.id, lastScanResult.company ?? '');
          if (f.field_key === 'email')   setValue(f.id, lastScanResult.email   ?? '');
          if (f.field_key === 'phone')   setValue(f.id, lastScanResult.phone   ?? '');
        });
      } else {
        form.fields.forEach(f => {
          if (['title', 'company', 'email'].includes(f.field_key || '')) setValue(f.id, '');
        });
      }
      return;
    }
    setIsOther(false);
    setManualFirst('');
    setManualLast('');
    setAttendeeSearch(`${attendee.first_name} ${attendee.last_name}`);
    setAttendeeDropOpen(false);
    const namePicker = form.fields.find(f => f.field_key === 'attendee_name');
    if (namePicker) setValue(namePicker.id, String(attendee.id));
    form.fields.forEach(f => {
      if (f.field_key === 'title' && attendee.title) setValue(f.id, attendee.title);
      if (f.field_key === 'company' && attendee.company_name) setValue(f.id, attendee.company_name);
      if (f.field_key === 'email' && attendee.email) setValue(f.id, attendee.email);
    });
  }, [form.fields, setValue, lastScanResult]);

  const handleScanFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset so same photo can be retried
    setScanLoading(true);
    setScanBanner(false);
    setScanCompanyMatches([]);
    setLastScanResult(null);
    try {
      const { base64, mediaType } = await compressImage(file);
      const res = await fetch('/api/scan-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64, media_type: mediaType }),
      });
      if (res.status === 503) {
        toast.error('Card scanning is not configured on this server.');
        return;
      }
      if (!res.ok) throw new Error('scan failed');
      const data: {
        first_name: string | null; last_name: string | null; title: string | null;
        company: string | null; email: string | null; phone: string | null; extra_text: string | null;
      } = await res.json();

      // Check if Claude found anything at all
      const hasAnyData = data.first_name || data.last_name || data.title || data.company || data.email || data.phone || data.extra_text;
      if (!hasAnyData) {
        toast.error('No contact info detected — try a clearer photo.');
        return;
      }

      setLastScanResult({ title: data.title, company: data.company, email: data.email, phone: data.phone });

      // ── Name → populate attendee search + default to "Other" path ──
      if (data.first_name || data.last_name) {
        const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ');
        setAttendeeSearch(fullName);
        setAttendeeDropOpen(true);
        setIsOther(true); // fallback — user can pick a match to override
        setManualFirst(data.first_name || '');
        setManualLast(data.last_name || '');
      }

      // ── Map detected values to matching form fields by field_key ──
      form.fields.forEach(f => {
        if (f.field_key === 'title' && data.title) setValue(f.id, data.title);
        if (f.field_key === 'company' && data.company) setValue(f.id, data.company);
        if (f.field_key === 'email' && data.email) setValue(f.id, data.email);
        if (f.field_key === 'phone' && data.phone) setValue(f.id, data.phone);
        // Extra text → first notes field found
        if (data.extra_text && (f.field_key === 'notes' || f.label.toLowerCase().includes('note'))) {
          setValue(f.id, data.extra_text);
        }
      });

      // ── Company name search → inline suggestions ──
      if (data.company) {
        const srRes = await fetch(`/api/search?q=${encodeURIComponent(data.company)}`).catch(() => null);
        if (srRes?.ok) {
          const sr = await srRes.json();
          if (sr.companies?.length) setScanCompanyMatches(sr.companies.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })));
        }
      }

      setScanBanner(true);
    } catch {
      toast.error('Could not read card — try again with better lighting');
    } finally {
      setScanLoading(false);
    }
  }, [form.fields, setValue]);

  const filteredAttendees = attendees.filter(a => {
    const q = attendeeSearch.toLowerCase();
    if (!q || q === 'other') return true;
    return `${a.first_name} ${a.last_name}`.toLowerCase().includes(q)
      || a.company_name?.toLowerCase().includes(q)
      || a.title?.toLowerCase().includes(q);
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const field of form.fields) {
      if (field.field_key === 'attendee_name') {
        if (!isOther && !values[field.id]) { toast.error('Name is required'); return; }
        if (isOther && (!manualFirst.trim() || !manualLast.trim())) { toast.error('First and last name are required'); return; }
        continue;
      }
      if (field.required) {
        const val = values[field.id];
        if (!val || (Array.isArray(val) ? val.length === 0 : !String(val).trim())) {
          toast.error(`"${field.label}" is required`);
          return;
        }
      }
    }
    setSubmitting(true);
    try {
      const submissionValues = form.fields
        .filter(f => f.field_key !== 'attendee_name')
        .map(f => ({
          field_id: f.id,
          field_label: f.label,
          field_value: Array.isArray(values[f.id]) ? (values[f.id] as string[]).join(', ') : (values[f.id] as string || ''),
        }));
      if (isOther) {
        submissionValues.unshift({ field_id: -1, field_label: 'Name', field_value: `${manualFirst} ${manualLast}`.trim() });
      } else {
        const namePicker = form.fields.find(f => f.field_key === 'attendee_name');
        const selectedAtt = attendees.find(a => String(a.id) === String(values[namePicker?.id || '']));
        if (selectedAtt) {
          submissionValues.unshift({ field_id: namePicker!.id, field_label: 'Name', field_value: `${selectedAtt.first_name} ${selectedAtt.last_name}` });
        }
      }
      const attendee_id = isOther ? undefined : values[form.fields.find(f => f.field_key === 'attendee_name')?.id || ''];
      const res = await fetch('/api/form-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conference_form_id: form.id,
          conference_id: conferenceId,
          values: submissionValues,
          attendee_id: attendee_id || null,
          manual_first_name: isOther ? manualFirst.trim() : undefined,
          manual_last_name: isOther ? manualLast.trim() : undefined,
        }),
      });
      if (!res.ok) throw new Error('Submission failed');
      toast.success('Form submitted!');
      onSubmitted();
      // Reset form for next attendee — keep form open at the booth
      setValues({});
      setAttendeeSearch('');
      setIsOther(false);
      setManualFirst('');
      setManualLast('');
      setLastScanResult(null);
    } catch {
      toast.error('Failed to submit form');
    } finally {
      setSubmitting(false);
    }
  };

  // Form card colors
  const bgColor = formMeta.background_color;
  const cardIsLight = isColorLight(bgColor);
  const textColor = cardIsLight ? '#1a1a1a' : '#ffffff';
  const inputBg = cardIsLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)';
  const inputBorder = cardIsLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.25)';
  const inputText = cardIsLight ? '#1a1a1a' : '#ffffff';
  const eyebrowColor = formMeta.eyebrow_color || textColor;
  const submitBg = formMeta.submit_button_color || (cardIsLight ? '#0B3C62' : '#ffffff');
  const submitTextColor = isColorLight(submitBg) ? '#0B3C62' : '#ffffff';

  // Page accent colors
  const accentColor = formMeta.accent_color;
  const accentBg = buildAccentBackground(accentColor, formMeta.accent_gradient);
  const accentIsLight = isColorLight(accentColor);

  const renderField = (field: FormField) => {
    if (field.field_key === 'attendee_name') {
      return (
        <div key={field.id} className="space-y-2">
          <label className="block text-sm font-semibold" style={{ color: textColor }}>
            {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
          </label>
          <div ref={attendeeDropRef} className="relative">
            <input
              type="text"
              value={attendeeSearch}
              onChange={e => { setAttendeeSearch(e.target.value); setAttendeeDropOpen(true); setIsOther(false); }}
              onFocus={() => setAttendeeDropOpen(true)}
              placeholder="Search attendees..."
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }}
            />
            {attendeeDropOpen && (
              <div className="absolute z-50 top-full mt-1 left-0 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-56 overflow-y-auto">
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 border-b border-gray-100 font-medium"
                  onClick={() => handleAttendeeSelect(null)}
                >
                  Other (not in list)
                </button>
                {filteredAttendees.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-gray-800"
                    onClick={() => handleAttendeeSelect(a)}
                  >
                    <span className="font-medium">{a.first_name} {a.last_name}</span>
                    {(a.title || a.company_name) && (
                      <span className="text-gray-400 text-xs ml-1">({[a.title, a.company_name].filter(Boolean).join(' – ')})</span>
                    )}
                  </button>
                ))}
                {filteredAttendees.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-400">No attendees found</div>
                )}
              </div>
            )}
          </div>
          {isOther && (
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: textColor }}>First Name *</label>
                <input type="text" value={manualFirst} onChange={e => setManualFirst(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }}
                  placeholder="First name" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: textColor }}>Last Name *</label>
                <input type="text" value={manualLast} onChange={e => setManualLast(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }}
                  placeholder="Last name" />
              </div>
            </div>
          )}
        </div>
      );
    }

    if (field.field_type === 'text_single') {
      const isCompanyField = field.field_key === 'company';
      const showCompanySuggestions = isCompanyField && scanCompanyMatches.length > 0;
      return (
        <div key={field.id}>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: textColor }}>
            {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
          </label>
          <div className="relative">
            <input type="text" value={(values[field.id] as string) || ''} onChange={e => setValue(field.id, e.target.value)}
              placeholder={field.placeholder || ''} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }} />
            {showCompanySuggestions && (
              <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
                <p className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-100">
                  Companies in system — tap to confirm
                </p>
                {scanCompanyMatches.slice(0, 5).map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-3 py-2.5 text-sm text-gray-800 hover:bg-blue-50 flex items-center gap-2"
                    onClick={() => { setValue(field.id, c.name); setScanCompanyMatches([]); }}
                  >
                    <svg className="w-3.5 h-3.5 text-brand-secondary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    {c.name}
                  </button>
                ))}
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-gray-600 border-t border-gray-100"
                  onClick={() => setScanCompanyMatches([])}
                >
                  Keep scanned value — will be created on submit if new
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (field.field_type === 'text_paragraph') {
      return (
        <div key={field.id}>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: textColor }}>
            {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
          </label>
          <textarea rows={4} value={(values[field.id] as string) || ''} onChange={e => setValue(field.id, e.target.value)}
            placeholder={field.placeholder || ''} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
            style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }} />
        </div>
      );
    }

    if (field.field_type === 'number') {
      return (
        <div key={field.id}>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: textColor }}>
            {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
          </label>
          <input type="number" value={(values[field.id] as string) || ''} onChange={e => setValue(field.id, e.target.value)}
            placeholder={field.placeholder || ''} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }} />
        </div>
      );
    }

    if (field.field_type === 'datetime') {
      return (
        <div key={field.id}>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: textColor }}>
            {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
          </label>
          <input type="datetime-local" value={(values[field.id] as string) || ''} onChange={e => setValue(field.id, e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }} />
        </div>
      );
    }

    if (field.field_type === 'checkbox') {
      return (
        <div key={field.id} className="flex items-center gap-3">
          <input type="checkbox" id={`field-${field.id}`} checked={(values[field.id] as string) === 'true'}
            onChange={e => setValue(field.id, e.target.checked ? 'true' : 'false')} className="w-4 h-4 rounded accent-white" />
          <label htmlFor={`field-${field.id}`} className="text-sm font-semibold" style={{ color: textColor }}>
            {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
          </label>
        </div>
      );
    }

    if (['dropdown', 'single_select'].includes(field.field_type)) {
      return (
        <div key={field.id}>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: textColor }}>
            {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
          </label>
          <select value={(values[field.id] as string) || ''} onChange={e => setValue(field.id, e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }}>
            <option value="">— Select —</option>
            {field.options.map(o => <option key={o.id} value={o.value}>{o.value}</option>)}
          </select>
        </div>
      );
    }

    if (field.field_type === 'multi_select') {
      const selected = (values[field.id] as string[] | undefined) || [];
      return (
        <div key={field.id}>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: textColor }}>
            {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
          </label>
          <div className="space-y-1.5">
            {field.options.map(o => (
              <label key={o.id} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={selected.includes(o.value)}
                  onChange={e => {
                    const next = e.target.checked ? [...selected, o.value] : selected.filter(v => v !== o.value);
                    setValue(field.id, next);
                  }} className="w-4 h-4 rounded" />
                <span className="text-sm" style={{ color: textColor }}>{o.value}</span>
              </label>
            ))}
          </div>
        </div>
      );
    }

    if (field.field_type === 'searchable_dropdown') {
      return (
        <SearchableDropdownField
          key={field.id}
          field={field}
          value={(values[field.id] as string) || ''}
          onChange={val => setValue(field.id, val)}
          textColor={textColor}
          inputBg={inputBg}
          inputBorder={inputBorder}
          inputText={inputText}
          conferenceId={conferenceId}
          attendees={attendees}
        />
      );
    }

    return null;
  };

  // Shared form card interior used in both layouts
  const formCardInterior = (
    <form onSubmit={handleSubmit} className="flex flex-col">
      {/* Card header */}
      <div className="px-6 pt-6 pb-3 text-center">
        <h2 className="text-xl font-bold font-serif" style={{ color: textColor }}>{formMeta.name}</h2>
        <p className="text-xs mt-0.5 opacity-70" style={{ color: eyebrowColor }}>{conferenceName}</p>
        {form.conference_logo_url && (
          <div className="flex justify-center mt-3">
            <img src={form.conference_logo_url} alt="Conference Logo" className="h-14 w-auto object-contain" />
          </div>
        )}
      </div>
      <div className="h-px mx-6 mb-1 opacity-20" style={{ background: textColor }} />

      {/* ── Card / Badge scanner ── */}
      <div className="px-6 pt-3 pb-1">
        <button
          type="button"
          disabled={scanLoading}
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{
            background: cardIsLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.13)',
            color: textColor,
            border: `1px solid ${inputBorder}`,
          }}
        >
          {scanLoading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Scanning…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Scan Business Card / Badge
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleScanFile}
        />
        {scanBanner && (
          <div
            className="mt-2 flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: cardIsLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)', color: textColor }}
          >
            <span className="opacity-80">✓ Card scanned — review fields and select any matches below</span>
            <button type="button" onClick={() => setScanBanner(false)} className="opacity-50 hover:opacity-100 flex-shrink-0">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}
      </div>

      {/* Fields */}
      <div className="px-6 py-4 space-y-5">
        {form.fields.map(renderField)}
      </div>
      {/* Submit */}
      <div className="px-6 pb-6">
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: submitBg, color: submitTextColor }}
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </form>
  );

  if (!mounted) return null;

  const formWidth = formMeta.form_width;
  const formHeight = formMeta.form_height ?? 560;
  const formX = formMeta.form_x ?? Math.round((window.innerWidth - formWidth) / 2);
  const formY = formMeta.form_offset_y ?? Math.round((window.innerHeight - formHeight) / 2);

  const overlay = (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        width: '100vw', height: '100vh',
        zIndex: 9999,
        overflow: 'hidden',
        background: accentBg,
        transition: 'background 0.3s ease',
      }}
    >
      {/* Full-bleed background media, drawn beneath the page background color/gradient.
          A background video, if set, takes precedence over a background image. */}
      {formMeta.background_video_url ? (
        <video
          src={formMeta.background_video_url}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ opacity: formMeta.background_video_opacity / 100 }}
          autoPlay
          muted
          loop
          playsInline
        />
      ) : formMeta.background_image_url && (
        <img
          src={formMeta.background_image_url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ opacity: formMeta.background_image_opacity / 100 }}
        />
      )}

      {/* Floating close button */}
      <button
        type="button"
        onClick={onClose}
        className="rounded-full w-8 h-8 flex items-center justify-center transition-opacity hover:opacity-70 shadow-md"
        style={{
          position: 'fixed', top: 16, right: 16, zIndex: 10000,
          background: accentIsLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)',
          color: accentIsLight ? '#1a1a1a' : '#ffffff',
        }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {isLandscape ? (
        /* ── Landscape: free-position/resize canvas ── */
        <div className="relative h-full w-full overflow-hidden">
          {form.panel_logo_url && (
            <img
              src={form.panel_logo_url}
              alt="Logo"
              className="absolute top-6 left-6 h-12 w-auto object-contain z-10 pointer-events-none"
            />
          )}

          {elements.map(el => (
            <Rnd
              key={el.id}
              size={{ width: el.width, height: el.height }}
              position={{ x: el.x, y: el.y }}
              disableDragging={!isEditMode}
              enableResizing={isEditMode}
              dragHandleClassName="rnd-drag-handle"
              bounds="parent"
              style={{ zIndex: el.z_index }}
              className={isEditMode ? 'ring-2 ring-white/60 rounded-xl' : ''}
              onDragStop={(_e, d) => updateElement(el.id, { x: Math.round(d.x), y: Math.round(d.y) })}
              onResizeStop={(_e, _dir, ref, _delta, pos) => updateElement(el.id, {
                width: ref.offsetWidth, height: ref.offsetHeight, x: Math.round(pos.x), y: Math.round(pos.y),
              })}
            >
              <div className="relative w-full h-full">
                {isEditMode && (
                  <div className="absolute -top-7 left-0 right-0 h-7 flex items-center bg-gray-800/85 rounded-t-md overflow-hidden z-20">
                    <div className="rnd-drag-handle flex-1 h-full flex items-center justify-center cursor-move text-white/70 hover:text-white" title="Drag to move">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><circle cx="8" cy="6" r="1.4" /><circle cx="16" cy="6" r="1.4" /><circle cx="8" cy="12" r="1.4" /><circle cx="16" cy="12" r="1.4" /><circle cx="8" cy="18" r="1.4" /><circle cx="16" cy="18" r="1.4" /></svg>
                    </div>
                    <div className="flex items-center gap-0.5 px-1">
                      {(el.element_type === 'image' || el.element_type === 'video') && (
                        <button
                          type="button"
                          onClick={() => updateElement(el.id, { object_fit: el.object_fit === 'cover' ? 'contain' : 'cover' })}
                          title={el.object_fit === 'cover' ? 'Stop cropping (fit full media)' : 'Crop'}
                          className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${el.object_fit === 'cover' ? 'text-brand-highlight' : 'text-white/70 hover:text-white'}`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 2v14a2 2 0 002 2h14M18 22V8a2 2 0 00-2-2H2" /></svg>
                        </button>
                      )}
                      <button type="button" onClick={() => reorderStack({ kind: 'element', id: el.id }, 'back')} title="Send to back" className="w-5 h-5 rounded flex items-center justify-center text-white/70 hover:text-white">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-5 5m5-5l5 5" /><path strokeLinecap="round" strokeLinejoin="round" d="M5 19h14" /></svg>
                      </button>
                      <button type="button" onClick={() => reorderStack({ kind: 'element', id: el.id }, 'backward')} title="Send backward" className="w-5 h-5 rounded flex items-center justify-center text-white/70 hover:text-white">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7-7-7" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 21V3" /></svg>
                      </button>
                      <button type="button" onClick={() => reorderStack({ kind: 'element', id: el.id }, 'forward')} title="Bring forward" className="w-5 h-5 rounded flex items-center justify-center text-white/70 hover:text-white">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7 7 7" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18" /></svg>
                      </button>
                      <button type="button" onClick={() => reorderStack({ kind: 'element', id: el.id }, 'front')} title="Bring to front" className="w-5 h-5 rounded flex items-center justify-center text-white/70 hover:text-white">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0l-5-5m5 5l5-5" /><path strokeLinecap="round" strokeLinejoin="round" d="M5 5h14" /></svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeElement(el.id)}
                        title="Remove"
                        className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 ml-0.5"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                )}
                {el.element_type === 'image' || el.element_type === 'video' ? (
                  <MediaElementCanvas
                    src={el.content || ''}
                    mediaType={el.element_type}
                    objectFit={el.object_fit}
                    focalX={el.focal_x}
                    focalY={el.focal_y}
                    isEditMode={isEditMode}
                    onFocalCommit={(x, y) => updateElement(el.id, { focal_x: x, focal_y: y })}
                  />
                ) : (
                  <TextElementCanvas
                    element={el}
                    isEditMode={isEditMode}
                    textColor={accentIsLight ? '#1a1a1a' : '#ffffff'}
                    onChange={html => updateElement(el.id, { content: html }, { debounce: true })}
                  />
                )}
              </div>
            </Rnd>
          ))}

          <Rnd
            size={{ width: formWidth, height: formHeight }}
            position={{ x: formX, y: formY }}
            disableDragging={!isEditMode}
            enableResizing={isEditMode}
            dragHandleClassName="rnd-drag-handle"
            bounds="parent"
            minWidth={280}
            minHeight={300}
            style={{ zIndex: formMeta.form_z_index }}
            className={isEditMode ? 'ring-2 ring-white/60 rounded-2xl' : ''}
            onDragStop={(_e, d) => patchFormMeta({ form_x: Math.round(d.x), form_offset_y: Math.round(d.y) })}
            onResizeStop={(_e, _dir, ref, _delta, pos) => patchFormMeta({
              form_width: ref.offsetWidth, form_height: ref.offsetHeight,
              form_x: Math.round(pos.x), form_offset_y: Math.round(pos.y),
            })}
          >
            <div className="relative w-full h-full">
              {isEditMode && (
                <div className="absolute -top-7 left-0 right-0 h-7 flex items-center bg-gray-800/85 rounded-t-md overflow-hidden z-20">
                  <div className="rnd-drag-handle flex-1 h-full flex items-center justify-center gap-1.5 cursor-move text-white/70 hover:text-white" title="Drag to move the form">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><circle cx="8" cy="6" r="1.4" /><circle cx="16" cy="6" r="1.4" /><circle cx="8" cy="12" r="1.4" /><circle cx="16" cy="12" r="1.4" /><circle cx="8" cy="18" r="1.4" /><circle cx="16" cy="18" r="1.4" /></svg>
                    <span className="text-[11px] font-semibold uppercase tracking-wide">Form</span>
                  </div>
                  <div className="flex items-center gap-0.5 px-1">
                    <button type="button" onClick={() => reorderStack({ kind: 'form', id: 'form' }, 'back')} title="Send to back" className="w-5 h-5 rounded flex items-center justify-center text-white/70 hover:text-white">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-5 5m5-5l5 5" /><path strokeLinecap="round" strokeLinejoin="round" d="M5 19h14" /></svg>
                    </button>
                    <button type="button" onClick={() => reorderStack({ kind: 'form', id: 'form' }, 'backward')} title="Send backward" className="w-5 h-5 rounded flex items-center justify-center text-white/70 hover:text-white">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7-7-7" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 21V3" /></svg>
                    </button>
                    <button type="button" onClick={() => reorderStack({ kind: 'form', id: 'form' }, 'forward')} title="Bring forward" className="w-5 h-5 rounded flex items-center justify-center text-white/70 hover:text-white">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7 7 7" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18" /></svg>
                    </button>
                    <button type="button" onClick={() => reorderStack({ kind: 'form', id: 'form' }, 'front')} title="Bring to front" className="w-5 h-5 rounded flex items-center justify-center text-white/70 hover:text-white">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0l-5-5m5 5l5-5" /><path strokeLinecap="round" strokeLinejoin="round" d="M5 5h14" /></svg>
                    </button>
                  </div>
                </div>
              )}
              <div className="w-full h-full rounded-2xl shadow-2xl overflow-y-auto" style={{ background: bgColor }}>
                {formCardInterior}
              </div>
            </div>
          </Rnd>

          <FormEditDrawer
            formId={form.id}
            isEditMode={isEditMode}
            onToggleEditMode={() => setIsEditMode(v => !v)}
            name={formMeta.name}
            onNameChange={v => patchFormMeta({ name: v }, 'name')}
            backgroundColor={formMeta.background_color}
            onBackgroundColorChange={v => patchFormMeta({ background_color: v }, 'bg')}
            accentColor={formMeta.accent_color}
            onAccentColorChange={v => patchFormMeta({ accent_color: v }, 'accent')}
            backgroundImageUrl={formMeta.background_image_url}
            onBackgroundImageChange={url => patchFormMeta({ background_image_url: url })}
            backgroundImageOpacity={formMeta.background_image_opacity}
            onBackgroundImageOpacityChange={v => patchFormMeta({ background_image_opacity: v }, 'bgOpacity')}
            backgroundVideoUrl={formMeta.background_video_url}
            onBackgroundVideoChange={url => patchFormMeta({ background_video_url: url })}
            backgroundVideoOpacity={formMeta.background_video_opacity}
            onBackgroundVideoOpacityChange={v => patchFormMeta({ background_video_opacity: v }, 'bgVideoOpacity')}
            eyebrowColor={formMeta.eyebrow_color}
            onEyebrowColorChange={v => patchFormMeta({ eyebrow_color: v }, 'eyebrow')}
            submitButtonColor={formMeta.submit_button_color}
            onSubmitButtonColorChange={v => patchFormMeta({ submit_button_color: v }, 'submitBtn')}
            onAddImage={url => addElement('image', url)}
            onAddVideo={url => addElement('video', url)}
            onAddText={() => addElement('text', '<p>New text</p>')}
          />
        </div>
      ) : (
        /* ── Portrait: centered card ── */
        <div className="flex flex-col p-6 py-12 overflow-y-auto" style={{ height: '100%' }}>
          <div
            className="my-auto mx-auto w-full max-w-[480px] rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: bgColor, border: '2px solid rgba(255,255,255,0.2)' }}
          >
            {formCardInterior}
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(overlay, document.body);
}

function SearchableDropdownField({
  field, value, onChange, textColor, inputBg, inputBorder, inputText, conferenceId, attendees,
}: {
  field: FormField;
  value: string;
  onChange: (v: string) => void;
  textColor: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  conferenceId: number;
  attendees: AttendeeOption[];
}) {
  const [search, setSearch] = useState(value);
  const [open, setOpen] = useState(false);
  const [dynOptions, setDynOptions] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!field.options_source) return;
    if (field.options_source === 'attendee_name') {
      setDynOptions(attendees.map(a => `${a.first_name} ${a.last_name}${a.title ? ` (${a.title}${a.company_name ? ` – ${a.company_name}` : ''})` : ''}`));
    } else if (field.options_source === 'company_name') {
      fetch('/api/companies').then(r => r.json()).then(cos => setDynOptions(cos.map((c: { name: string }) => c.name))).catch(() => {});
    } else if (field.options_source === 'assigned_user') {
      fetch('/api/config?category=user').then(r => r.json()).then(us => setDynOptions(us.map((u: { value: string }) => u.value))).catch(() => {});
    } else if (field.options_source === 'conference_name') {
      fetch('/api/conferences').then(r => r.json()).then(cs => setDynOptions(cs.map((c: { name: string }) => c.name))).catch(() => {});
    }
  }, [field.options_source, attendees]);

  const allOptions = field.options_source ? dynOptions : field.options.map(o => o.value);
  const filtered = allOptions.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref}>
      <label className="block text-sm font-semibold mb-1.5" style={{ color: textColor }}>
        {field.label}{field.required && <span className="ml-1 text-red-400">*</span>}
      </label>
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); onChange(e.target.value); }}
          onFocus={() => setOpen(true)}
          placeholder={field.placeholder || 'Search...'}
          className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
          style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputText }}
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-50 top-full mt-1 left-0 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
            {filtered.map(o => (
              <button
                key={o}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-gray-800"
                onClick={() => { onChange(o); setSearch(o); setOpen(false); }}
              >
                {o}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
