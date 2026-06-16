'use client';

import { useState, useEffect, useRef } from 'react';
import { useUser } from '@/components/UserContext';

type Recipient = { id?: number; email: string; name: string };
type SystemUser = { id: number; email: string; displayName: string | null };
type PendingRequest = {
  id: number;
  recipientEmail: string;
  recipientName: string;
  recipientTitle: string | null;
  recipientUserId: number | null;
  status: 'pending' | 'responded' | 'expired';
  createdAt: string;
};
type SendState = 'idle' | 'sending' | 'sent' | 'error';

type Props = {
  conferenceId: number;
  conferenceName: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RequestInputDropdown({ conferenceId, conferenceName }: Props) {
  const { user } = useUser();
  const currentUserEmail = user?.email ?? '';

  const [open, setOpen] = useState(false);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchList, setShowSearchList] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [showOtherForm, setShowOtherForm] = useState(false);
  const [otherName, setOtherName] = useState('');
  const [otherTitle, setOtherTitle] = useState('');
  const [otherEmail, setOtherEmail] = useState('');
  const [otherEmailError, setOtherEmailError] = useState('');
  const [sendState, setSendState] = useState<SendState>('idle');
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch('/api/chat/users')
      .then(r => r.ok ? r.json() : [])
      .then((data: SystemUser[]) => setSystemUsers(data))
      .catch(() => {});
    loadPendingRequests();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conferenceId]);

  const loadPendingRequests = () => {
    fetch(`/api/calendar-intelligence/request-input?conferenceId=${conferenceId}`)
      .then(r => r.ok ? r.json() : { requests: [] })
      .then((data: { requests: PendingRequest[] }) => setPendingRequests(data.requests ?? []))
      .catch(() => {});
  };

  const filteredUsers = systemUsers.filter(u => {
    if (recipients.some(r => r.email === u.email)) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (u.displayName ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const addSystemUser = (u: SystemUser) => {
    setRecipients(prev => [...prev, { id: u.id, email: u.email, name: u.displayName ?? u.email }]);
    setSearchQuery('');
    setShowSearchList(false);
  };

  const addOtherRecipient = () => {
    if (!otherName.trim()) return;
    setOtherEmailError('');
    if (!EMAIL_RE.test(otherEmail.trim())) {
      setOtherEmailError('Please enter a valid email address');
      return;
    }
    const email = otherEmail.trim().toLowerCase();
    if (recipients.some(r => r.email === email)) {
      setOtherEmailError('This person is already in your list');
      return;
    }
    setRecipients(prev => [...prev, { email, name: otherName.trim() }]);
    setOtherName(''); setOtherTitle(''); setOtherEmail(''); setOtherEmailError('');
    setShowOtherForm(false);
  };

  const removeRecipient = (email: string) => {
    setRecipients(prev => prev.filter(r => r.email !== email));
  };

  const doSend = async (overrideRecipients?: Recipient[]) => {
    const toSend = overrideRecipients ?? recipients;
    if (toSend.length === 0 || sendState === 'sending') return;
    setSendState('sending');
    try {
      const res = await fetch('/api/calendar-intelligence/request-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conferenceId,
          recipients: toSend.map(r => ({ userId: r.id, email: r.email, name: r.name })),
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setSendState('sent');
      if (!overrideRecipients) setRecipients([]);
      loadPendingRequests();
      setTimeout(() => setSendState('idle'), 3000);
    } catch {
      setSendState('error');
      setTimeout(() => setSendState('idle'), 3000);
    }
  };

  const handleTestRequest = () => {
    doSend([{ email: 'kwinn@useparlay.app', name: 'Kevin Winn', id: undefined }]);
  };

  const sendLabel = sendState === 'sending' ? 'Sending…'
    : sendState === 'sent' ? 'Sent'
    : sendState === 'error' ? 'Failed — try again'
    : 'Send request';

  const sendIcon = sendState === 'sending' ? null
    : sendState === 'sent' ? 'ti-check'
    : sendState === 'error' ? 'ti-alert-circle'
    : 'ti-send';

  const sendBg = sendState === 'sent' ? '#059669'
    : sendState === 'error' ? '#dc2626'
    : 'rgb(var(--brand-secondary-rgb, 27 118 188))';

  return (
    <div>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 11,
          fontWeight: 600,
          color: 'rgb(var(--brand-secondary-rgb, 27 118 188))',
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}
      >
        <i className="ti ti-user-plus" style={{ fontSize: 12 }} aria-hidden="true" />
        Request input
        <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 10, opacity: 0.5 }} aria-hidden="true" />
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>

          {/* Selected recipient pills */}
          {recipients.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {recipients.map(r => (
                <span
                  key={r.email}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px 2px 10px',
                    background: 'rgb(var(--brand-primary-rgb, 11 60 98))',
                    color: '#ffffff', borderRadius: 20, fontSize: 11, fontWeight: 500,
                  }}
                >
                  {r.name}
                  <button
                    type="button"
                    onClick={() => removeRecipient(r.email)}
                    style={{
                      background: 'none', border: 'none', color: 'rgba(255,255,255,.7)',
                      cursor: 'pointer', padding: '0 0 0 2px', fontSize: 13, lineHeight: 1,
                    }}
                    aria-label={`Remove ${r.name}`}
                  >×</button>
                </span>
              ))}
            </div>
          )}

          {/* Search input or Other form */}
          {!showOtherForm ? (
            <div style={{ position: 'relative' }}>
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setShowSearchList(true); }}
                onFocus={() => setShowSearchList(true)}
                onBlur={() => setTimeout(() => setShowSearchList(false), 150)}
                placeholder="Search team members…"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '6px 10px', borderRadius: 6,
                  border: '1px solid var(--color-border, #e5e7eb)',
                  fontSize: 11, outline: 'none', color: '#1a1a1a',
                }}
              />
              {showSearchList && (
                <div style={{
                  position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 2,
                  background: '#fff', border: '1px solid var(--color-border, #e5e7eb)',
                  borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,.1)',
                  zIndex: 20, maxHeight: 180, overflowY: 'auto',
                }}>
                  {filteredUsers.length === 0 && !searchQuery && (
                    <p style={{ padding: '8px 12px', fontSize: 11, color: '#9ca3af', margin: 0 }}>
                      All team members already added
                    </p>
                  )}
                  {filteredUsers.length === 0 && searchQuery && (
                    <p style={{ padding: '8px 12px', fontSize: 11, color: '#9ca3af', margin: 0 }}>
                      No matches for &ldquo;{searchQuery}&rdquo;
                    </p>
                  )}
                  {filteredUsers.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onMouseDown={() => addSystemUser(u)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '7px 12px', background: 'none', border: 'none',
                        cursor: 'pointer', fontSize: 11,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <span style={{ fontWeight: 500, color: '#1a1a1a' }}>{u.displayName ?? u.email}</span>
                      <span style={{ color: '#9ca3af', marginLeft: 6 }}>{u.email}</span>
                    </button>
                  ))}
                  {/* Divider + Other */}
                  <div style={{ borderTop: '1px solid #f3f4f6', margin: '2px 0' }} />
                  <button
                    type="button"
                    onMouseDown={() => { setShowOtherForm(true); setShowSearchList(false); setSearchQuery(''); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                      textAlign: 'left', padding: '7px 12px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 11, color: 'rgb(var(--brand-secondary-rgb, 27 118 188))', fontWeight: 500,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <i className="ti ti-user-plus" style={{ fontSize: 11 }} aria-hidden="true" />
                    + Other (external recipient)
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* External recipient form */
            <div style={{
              padding: 10, background: '#f9fafb',
              border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 6,
            }}>
              <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: '#6b7280', marginBottom: 8 }}>
                External recipient
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  type="text"
                  value={otherName}
                  onChange={e => setOtherName(e.target.value)}
                  placeholder="Name *"
                  autoFocus
                  style={{
                    padding: '5px 8px', borderRadius: 5, fontSize: 11,
                    border: '1px solid var(--color-border, #e5e7eb)', outline: 'none',
                  }}
                />
                <input
                  type="text"
                  value={otherTitle}
                  onChange={e => setOtherTitle(e.target.value)}
                  placeholder="Title (optional)"
                  style={{
                    padding: '5px 8px', borderRadius: 5, fontSize: 11,
                    border: '1px solid var(--color-border, #e5e7eb)', outline: 'none',
                  }}
                />
                <div>
                  <input
                    type="email"
                    value={otherEmail}
                    onChange={e => { setOtherEmail(e.target.value); setOtherEmailError(''); }}
                    placeholder="Email *"
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      padding: '5px 8px', borderRadius: 5, fontSize: 11,
                      border: `1px solid ${otherEmailError ? '#dc2626' : 'var(--color-border, #e5e7eb)'}`,
                      outline: 'none',
                    }}
                  />
                  {otherEmailError && (
                    <p style={{ fontSize: 10, color: '#dc2626', margin: '3px 0 0' }}>{otherEmailError}</p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                  <button
                    type="button"
                    onClick={addOtherRecipient}
                    disabled={!otherName.trim() || !otherEmail.trim()}
                    style={{
                      flex: 1, padding: '5px 10px', borderRadius: 5, fontSize: 11,
                      background: 'rgb(var(--brand-primary-rgb, 11 60 98))',
                      color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 500,
                      opacity: !otherName.trim() || !otherEmail.trim() ? 0.4 : 1,
                    }}
                  >Add</button>
                  <button
                    type="button"
                    onClick={() => { setShowOtherForm(false); setOtherName(''); setOtherTitle(''); setOtherEmail(''); setOtherEmailError(''); }}
                    style={{
                      padding: '5px 10px', borderRadius: 5, fontSize: 11,
                      background: 'none', color: '#6b7280',
                      border: '1px solid var(--color-border, #e5e7eb)', cursor: 'pointer',
                    }}
                  >Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* Send request button */}
          <button
            type="button"
            onClick={() => doSend()}
            disabled={recipients.length === 0 || sendState === 'sending'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', marginTop: 8, padding: '7px 12px',
              background: sendBg, color: '#fff',
              border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600,
              cursor: recipients.length === 0 || sendState === 'sending' ? 'not-allowed' : 'pointer',
              opacity: recipients.length === 0 ? 0.4 : 1,
              transition: 'background .15s ease',
            }}
          >
            {sendState === 'sending' ? (
              <span style={{
                display: 'inline-block', width: 10, height: 10,
                border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff',
                borderRadius: '50%', animation: 'spin 0.6s linear infinite',
              }} />
            ) : sendIcon ? (
              <i className={`ti ${sendIcon}`} style={{ fontSize: 12 }} aria-hidden="true" />
            ) : null}
            {sendLabel}
          </button>

          {/* Test button — only for kwinn@useparlay.app */}
          {currentUserEmail === 'kwinn@useparlay.app' && (
            <button
              type="button"
              onClick={handleTestRequest}
              disabled={sendState === 'sending'}
              style={{
                marginTop: 6, fontSize: 11, padding: '4px 10px',
                borderRadius: 'var(--border-radius-md, 6px)',
                border: '0.5px dashed #185FA5', background: '#E6F1FB',
                color: '#0C447C', cursor: 'pointer', width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                opacity: sendState === 'sending' ? 0.5 : 1,
              }}
            >
              <i className="ti ti-flask" style={{ fontSize: 11 }} aria-hidden="true" />
              Test: send to kwinn@useparlay.app
            </button>
          )}

          {/* Pending requests */}
          {pendingRequests.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '0.5px solid var(--color-border-tertiary, #e5e7eb)', paddingTop: 10 }}>
              <p style={{
                fontSize: 10, color: 'var(--color-text-tertiary, #9ca3af)',
                textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6, fontWeight: 600,
              }}>
                Awaiting input
              </p>
              {pendingRequests.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: 'rgb(var(--brand-primary-rgb, 11 60 98))',
                    color: '#fff', fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {r.recipientName.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 11, margin: 0, color: '#1a1a1a', fontWeight: 500 }}>{r.recipientName}</p>
                    {r.recipientTitle && (
                      <p style={{ fontSize: 10, color: 'var(--color-text-tertiary, #9ca3af)', margin: 0 }}>{r.recipientTitle}</p>
                    )}
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
                    ...(r.status === 'responded'
                      ? { background: '#d1fae5', color: '#065f46' }
                      : r.status === 'expired'
                      ? { background: '#f3f4f6', color: '#6b7280' }
                      : { background: '#fef3c7', color: '#92400e' }),
                  }}>
                    {r.status === 'responded' ? 'Responded' : r.status === 'expired' ? 'Expired' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
