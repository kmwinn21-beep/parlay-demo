'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useEditor } from '@tiptap/react';
import { RichTextEditor, getEditorExtensions } from '@/components/RichTextEditor';

type OAuthProvider = 'google' | 'microsoft';

interface Template {
  id: number;
  name: string;
  subject: string;
  body: string;
}

interface ConnectedAccount {
  email: string | null;
}

interface Props {
  contactEmail: string;
  contactName?: string;
  onClose: () => void;
}

export function ComposeEmailModal({ contactEmail, contactName, onClose }: Props) {
  const [connected, setConnected] = useState<Partial<Record<OAuthProvider, ConnectedAccount>>>({});
  const [provider, setProvider] = useState<OAuthProvider | null>(null);
  const [subject, setSubject] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const signatureLoadedRef = useRef(false);

  const editor = useEditor({
    extensions: getEditorExtensions(),
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[160px] p-3 focus:outline-none',
      },
    },
  });

  useEffect(() => {
    fetch('/api/oauth/status')
      .then(r => r.ok ? r.json() : { connected: {} })
      .then((data: { connected: Partial<Record<OAuthProvider, ConnectedAccount>> }) => {
        setConnected(data.connected);
        const providers = Object.keys(data.connected) as OAuthProvider[];
        if (providers.length === 1) setProvider(providers[0]);
      })
      .catch(() => {});
    fetch('/api/email-templates')
      .then(r => r.ok ? r.json() : [])
      .then(setTemplates)
      .catch(() => {});
  }, []);

  // Load signature once editor is ready
  useEffect(() => {
    if (!editor || signatureLoadedRef.current) return;
    signatureLoadedRef.current = true;
    fetch('/api/user/signature')
      .then(r => r.ok ? r.json() : { signature: '' })
      .then((data: { signature: string }) => {
        if (data.signature) {
          editor.commands.setContent(
            `<p></p><p>--</p>${data.signature}`
          );
          // Move cursor to the very beginning so the user types above the signature
          editor.commands.focus('start');
        }
      })
      .catch(() => {});
  }, [editor]);

  const applyTemplate = useCallback((id: string) => {
    const tmpl = templates.find(t => String(t.id) === id);
    if (!tmpl || !editor) return;
    setSubject(tmpl.subject);
    editor.commands.setContent(tmpl.body);
    setSelectedTemplate(id);
  }, [templates, editor]);

  const handleAddFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setAttachments(prev => [...prev, ...files]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider) { toast.error('Select a provider.'); return; }
    if (!subject.trim()) { toast.error('Subject is required.'); return; }
    if (!editor || editor.isEmpty) { toast.error('Email body is required.'); return; }

    const fd = new FormData();
    fd.append('provider', provider);
    fd.append('to', contactEmail);
    fd.append('subject', subject);
    fd.append('body', editor.getHTML());
    for (const file of attachments) fd.append('attachments', file);

    setSending(true);
    try {
      const res = await fetch('/api/emails/send', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Send failed.');
      toast.success('Email sent!');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send email.');
    } finally {
      setSending(false);
    }
  };

  const connectedProviders = Object.keys(connected) as OAuthProvider[];
  const noneConnected = connectedProviders.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl border border-brand-highlight w-full max-w-2xl mx-4 flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h3 className="text-base font-semibold text-brand-primary font-serif">
            Compose Email{contactName ? ` — ${contactName}` : ''}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          {noneConnected ? (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
              <p className="text-sm text-amber-800 font-medium">No email account connected.</p>
              <p className="text-sm text-amber-700 mt-1">
                Go to{' '}
                <a href="/auth/account" className="underline font-medium">Account Settings</a>
                {' '}to connect your Google or Microsoft account.
              </p>
            </div>
          ) : (
            <form id="compose-form" onSubmit={handleSend} className="space-y-4">
              {/* To */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">To</label>
                <input className="input-field bg-gray-50 cursor-default" value={contactEmail} readOnly />
              </div>

              {/* Provider */}
              {connectedProviders.length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Send via</label>
                  <div className="flex gap-2">
                    {connectedProviders.map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setProvider(p)}
                        className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${provider === p ? 'border-brand-secondary bg-brand-secondary/10 text-brand-secondary' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                      >
                        {p === 'google' ? 'Google' : 'Microsoft'}{connected[p]?.email ? ` (${connected[p]!.email})` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Template */}
              {templates.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Template</label>
                  <select
                    className="input-field"
                    value={selectedTemplate}
                    onChange={e => applyTemplate(e.target.value)}
                  >
                    <option value="">— Select a template —</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}

              {/* Subject */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Subject</label>
                <input
                  className="input-field"
                  placeholder="Subject"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  required
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Body</label>
                <RichTextEditor editor={editor} minHeight="160px" />
              </div>

              {/* Attachments */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Attachments</label>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleAddFiles}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="btn-secondary text-sm flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  Attach files
                </button>
                {attachments.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {attachments.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="flex-1 truncate">{f.name}</span>
                        <button
                          type="button"
                          onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                          className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        {!noneConnected && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
            <button
              type="submit"
              form="compose-form"
              disabled={sending || !provider}
              className="btn-primary text-sm flex-1 flex items-center justify-center gap-2"
            >
              {sending ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Sending…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Send
                </>
              )}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
