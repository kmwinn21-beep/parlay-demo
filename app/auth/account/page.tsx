'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useUser } from '@/components/UserContext';
import { BackButton } from '@/components/BackButton';

interface ConfigOption {
  id: number;
  value: string;
}

interface NotifPrefs {
  company_status_change: boolean;
  follow_up_assigned: boolean;
  note_tagged: boolean;
  company_status_change_email: boolean;
  follow_up_assigned_email: boolean;
  note_tagged_email: boolean;
  note_comment_received: boolean;
  note_comment_received_email: boolean;
  note_comment_thread: boolean;
  note_comment_thread_email: boolean;
  note_reaction_received: boolean;
  note_reaction_received_email: boolean;
  note_lets_talk: boolean;
  note_lets_talk_email: boolean;
  comment_reaction_received: boolean;
  comment_reaction_received_email: boolean;
}

function formatMemberSince(raw: string | null): string {
  if (!raw) return '—';
  const d = new Date(raw.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ─── Section: Profile & Identity ─────────────────────────────────────────────

function ProfileSection({ onRefresh }: { onRefresh: () => void }) {
  const { user } = useUser();
  const [repOptions, setRepOptions] = useState<ConfigOption[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [configId, setConfigId] = useState<number | ''>('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);
  const [emailChangeDevLink, setEmailChangeDevLink] = useState<string | null>(null);

  const [resending, setResending] = useState(false);
  const [resendDevLink, setResendDevLink] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/config?category=user')
      .then(r => r.ok ? r.json() : [])
      .then((data: ConfigOption[]) => setRepOptions(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName ?? '');
      setConfigId(user.configId ?? '');
    }
  }, [user]);

  if (!user) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await fetch('/api/auth/update-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim() || null,
          configId: configId !== '' ? Number(configId) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to save profile.'); return; }
      toast.success('Profile saved.');
      onRefresh();
    } catch {
      toast.error('Network error.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangingEmail(true);
    setEmailChangeDevLink(null);
    try {
      const res = await fetch('/api/auth/change-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEmail, currentPassword: emailPassword }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to initiate email change.'); return; }
      toast.success('Confirmation email sent to your new address.');
      if (data.devVerifyLink) setEmailChangeDevLink(data.devVerifyLink);
      setNewEmail('');
      setEmailPassword('');
      setShowEmailForm(false);
    } catch {
      toast.error('Network error.');
    } finally {
      setChangingEmail(false);
    }
  };

  const handleResendVerification = async () => {
    setResending(true);
    setResendDevLink(null);
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to resend.'); return; }
      toast.success('Verification email sent.');
      if (data.devVerifyLink) setResendDevLink(data.devVerifyLink);
    } catch {
      toast.error('Network error.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="card space-y-5">
      <h2 className="text-base font-semibold text-brand-primary font-serif">Profile &amp; Identity</h2>

      <form onSubmit={handleSaveProfile} className="space-y-4">
        {/* Display name */}
        <div>
          <label className="label text-xs">Display Name <span className="text-gray-400 font-normal">(optional)</span></label>
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="How your name appears in the app"
            className="input-field"
          />
        </div>

        {/* Rep profile */}
        <div>
          <label className="label text-xs">Rep Profile</label>
          <select
            value={configId}
            onChange={e => setConfigId(e.target.value !== '' ? Number(e.target.value) : '')}
            className="input-field"
          >
            <option value="">— None —</option>
            {repOptions.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.value}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">Links your account to a rep for meeting and note attribution.</p>
        </div>

        <button type="submit" disabled={savingProfile} className="btn-primary text-sm">
          {savingProfile ? 'Saving…' : 'Save Profile'}
        </button>
      </form>

      <div className="border-t border-gray-100 pt-4 space-y-3">
        {/* Email row */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</p>
              <p className="text-sm text-gray-800 mt-0.5 flex items-center gap-2">
                {user.email}
                {user.emailVerified ? (
                  <span className="text-xs text-green-600 font-medium">Verified</span>
                ) : (
                  <span className="text-xs text-yellow-600 font-medium">Unverified</span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowEmailForm(v => !v)}
              className="text-xs text-brand-secondary font-medium hover:underline flex-shrink-0"
            >
              {showEmailForm ? 'Cancel' : 'Change'}
            </button>
          </div>

          {showEmailForm && (
            <form onSubmit={handleChangeEmail} className="mt-3 space-y-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500">Enter your new email and confirm with your current password. A verification link will be sent to the new address.</p>
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                required
                placeholder="New email address"
                className="input-field text-sm"
              />
              <input
                type="password"
                value={emailPassword}
                onChange={e => setEmailPassword(e.target.value)}
                required
                placeholder="Current password"
                className="input-field text-sm"
              />
              <button type="submit" disabled={changingEmail} className="btn-primary text-xs">
                {changingEmail ? 'Sending…' : 'Send Confirmation'}
              </button>
            </form>
          )}

          {emailChangeDevLink && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
              <span className="font-semibold text-yellow-800">Dev link:</span>{' '}
              <a href={emailChangeDevLink} className="text-brand-secondary underline break-all">{emailChangeDevLink}</a>
            </div>
          )}

          {!user.emailVerified && (
            <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center justify-between gap-3">
              <p className="text-xs text-yellow-800 font-medium">Email not verified. Check your inbox.</p>
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={resending}
                className="text-xs text-brand-secondary font-medium hover:underline flex-shrink-0"
              >
                {resending ? 'Sending…' : 'Resend'}
              </button>
            </div>
          )}

          {resendDevLink && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
              <span className="font-semibold text-yellow-800">Dev link:</span>{' '}
              <a href={resendDevLink} className="text-brand-secondary underline break-all">{resendDevLink}</a>
            </div>
          )}
        </div>

        {/* Role */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</p>
          <span className={`inline-flex mt-0.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            user.role === 'administrator' ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-600'
          }`}>
            {user.role === 'administrator' ? 'Administrator' : 'Standard User'}
          </span>
        </div>

        {/* Member since */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Member Since</p>
          <p className="text-sm text-gray-800 mt-0.5">{formatMemberSince(user.createdAt)}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Section: Notification Preferences ───────────────────────────────────────

function Toggle({ checked, disabled, onClick }: { checked: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className={`relative flex-shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary ${
        checked ? 'bg-brand-secondary' : 'bg-gray-200'
      }`}
      style={{ height: '22px', width: '40px' }}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function NotificationPrefsSection() {
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/notification-preferences')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setPrefs(data); })
      .catch(() => {});
  }, []);

  const toggle = async (key: keyof NotifPrefs) => {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(true);
    try {
      const res = await fetch('/api/notification-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next[key] }),
      });
      if (!res.ok) {
        setPrefs(prefs);
        toast.error('Failed to save preference.');
      }
    } catch {
      setPrefs(prefs);
      toast.error('Network error.');
    } finally {
      setSaving(false);
    }
  };

  type PrefItem = { key: keyof NotifPrefs; emailKey: keyof NotifPrefs; label: string; description: string };

  const prefItemsOptOut: PrefItem[] = [
    { key: 'company_status_change', emailKey: 'company_status_change_email', label: 'Company Status Changes', description: 'When a company you\'re assigned to changes status.' },
    { key: 'follow_up_assigned', emailKey: 'follow_up_assigned_email', label: 'Follow-up Assigned', description: 'When a follow-up task is assigned to you.' },
    { key: 'note_tagged', emailKey: 'note_tagged_email', label: 'Note Mentions', description: 'When someone @mentions you in a note.' },
  ];

  const prefItemsOptIn: PrefItem[] = [
    { key: 'note_comment_received', emailKey: 'note_comment_received_email', label: 'Comment on My Note', description: 'When someone comments on a note you wrote.' },
    { key: 'note_comment_thread', emailKey: 'note_comment_thread_email', label: 'Thread Update', description: 'When a new comment is added to a note thread you\'ve joined.' },
    { key: 'note_reaction_received', emailKey: 'note_reaction_received_email', label: 'Note Reaction', description: 'When someone likes or dislikes your note.' },
    { key: 'note_lets_talk', emailKey: 'note_lets_talk_email', label: 'Let\'s Talk', description: 'When the Let\'s Talk button is triggered on a note you\'re involved in.' },
    { key: 'comment_reaction_received', emailKey: 'comment_reaction_received_email', label: 'Comment Reaction', description: 'When someone likes or dislikes your comment.' },
  ];

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-brand-primary font-serif mb-1">Notification Preferences</h2>
      <p className="text-xs text-gray-400 mb-4">Choose which notifications you receive.</p>
      {prefs === null ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Column headers */}
          <div className="flex items-center justify-end gap-6 pr-0.5">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide" style={{ width: '40px', textAlign: 'center' }}>In-App</span>
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide" style={{ width: '40px', textAlign: 'center' }}>Email</span>
          </div>

          {/* Opt-out section */}
          <div className="space-y-4">
            {prefItemsOptOut.map(({ key, emailKey, label, description }) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-800">{label}</p>
                  <p className="text-xs text-gray-400">{description}</p>
                </div>
                <div className="flex items-center gap-6 flex-shrink-0">
                  <Toggle checked={prefs[key]} disabled={saving} onClick={() => toggle(key)} />
                  <Toggle checked={prefs[emailKey]} disabled={saving} onClick={() => toggle(emailKey)} />
                </div>
              </div>
            ))}
          </div>

          {/* Note engagement section */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Note Engagement</p>
            <div className="space-y-4">
              {prefItemsOptIn.map(({ key, emailKey, label, description }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{label}</p>
                    <p className="text-xs text-gray-400">{description}</p>
                  </div>
                  <div className="flex items-center gap-6 flex-shrink-0">
                    <Toggle checked={prefs[key]} disabled={saving} onClick={() => toggle(key)} />
                    <Toggle checked={prefs[emailKey]} disabled={saving} onClick={() => toggle(emailKey)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section: Connected Accounts ─────────────────────────────────────────────

type OAuthProvider = 'google' | 'microsoft';

function ConnectedAccountsSection() {
  const [connected, setConnected] = useState<Partial<Record<OAuthProvider, { email: string | null }>>>({});
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<OAuthProvider | null>(null);

  const fetchStatus = () => {
    fetch('/api/oauth/status')
      .then(r => r.ok ? r.json() : { connected: {} })
      .then((data: { connected: Partial<Record<OAuthProvider, { email: string | null }>> }) => {
        setConnected(data.connected);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStatus();
    // Show toasts for OAuth callback results
    const params = new URLSearchParams(window.location.search);
    const connectedParam = params.get('connected');
    const errorParam = params.get('error');
    if (connectedParam) {
      toast.success(`${connectedParam === 'google' ? 'Google' : 'Microsoft'} account connected!`);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (errorParam) {
      const messages: Record<string, string> = {
        google_denied: 'Google authorization was denied.',
        microsoft_denied: 'Microsoft authorization was denied.',
        google_token_failed: 'Failed to connect Google account.',
        microsoft_token_failed: 'Failed to connect Microsoft account.',
        invalid_state: 'OAuth state mismatch. Please try again.',
      };
      toast.error(messages[errorParam] ?? 'OAuth error. Please try again.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleDisconnect = async (provider: OAuthProvider) => {
    setDisconnecting(provider);
    try {
      const res = await fetch(`/api/oauth/${provider}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success(`${provider === 'google' ? 'Google' : 'Microsoft'} account disconnected.`);
      fetchStatus();
    } catch {
      toast.error('Failed to disconnect account.');
    } finally {
      setDisconnecting(null);
    }
  };

  const PROVIDERS: { key: OAuthProvider; label: string; icon: React.ReactNode }[] = [
    {
      key: 'google',
      label: 'Google',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
      ),
    },
    {
      key: 'microsoft',
      label: 'Microsoft',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
          <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
          <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
          <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
          <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
        </svg>
      ),
    },
  ];

  const googleConfigured = !!process.env.NEXT_PUBLIC_BASE_URL || true; // always show

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-brand-primary font-serif mb-1">Connected Accounts</h2>
      <p className="text-xs text-gray-400 mb-4">Connect your work email to send outreach emails directly from the app.</p>
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {PROVIDERS.map(({ key, label, icon }) => {
            const info = connected[key];
            return (
              <div key={key} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200">
                <div className="flex-shrink-0">{icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{label}</p>
                  {info ? (
                    <p className="text-xs text-green-600 font-medium">{info.email ?? 'Connected'}</p>
                  ) : (
                    <p className="text-xs text-gray-400">Not connected</p>
                  )}
                </div>
                {info ? (
                  <button
                    type="button"
                    onClick={() => handleDisconnect(key)}
                    disabled={disconnecting === key}
                    className="btn-secondary text-xs flex-shrink-0"
                  >
                    {disconnecting === key ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                ) : (
                  <a href={`/api/oauth/${key}`} className="btn-primary text-xs flex-shrink-0">
                    Connect
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Section: Change Password ─────────────────────────────────────────────────

function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { toast.error('New passwords do not match.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to change password.'); return; }
      toast.success('Password changed successfully.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch {
      toast.error('Network error.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-brand-primary font-serif mb-4">Change Password</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label text-xs">Current Password</label>
          <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
            required placeholder="Your current password" className="input-field" />
        </div>
        <div>
          <label className="label text-xs">New Password</label>
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
            required minLength={8} placeholder="At least 8 characters" className="input-field" />
        </div>
        <div>
          <label className="label text-xs">Confirm New Password</label>
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
            required placeholder="Repeat new password" className="input-field" />
        </div>
        <button type="submit" disabled={saving} className="btn-primary text-sm">
          {saving ? 'Saving…' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const { user, refresh } = useUser();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/auth/login';
    } catch {
      toast.error('Logout failed.');
      setLoggingOut(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <BackButton />
      <div>
        <h1 className="text-2xl font-bold text-brand-primary font-serif">My Account</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your profile and security settings.</p>
      </div>

      <ProfileSection onRefresh={refresh} />
      <ConnectedAccountsSection />
      <NotificationPrefsSection />
      <ChangePasswordSection />

      <div className="card">
        <h2 className="text-base font-semibold text-brand-primary font-serif mb-3">Session</h2>
        <p className="text-sm text-gray-500 mb-4">
          Sign out of {process.env.NEXT_PUBLIC_APP_NAME ?? 'Conference Hub'} on this device.
        </p>
        <button onClick={handleLogout} disabled={loggingOut} className="btn-danger text-sm">
          {loggingOut ? 'Signing out…' : 'Sign Out'}
        </button>
      </div>
    </div>
  );
}
