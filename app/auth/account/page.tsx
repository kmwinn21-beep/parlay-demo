'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useEditor } from '@tiptap/react';
import { useUser } from '@/components/UserContext';
import { BackButton } from '@/components/BackButton';
import { RichTextEditor, getEditorExtensions } from '@/components/RichTextEditor';
import { SlackAccountSection, readSlackCallback, clearSlackCallback } from '@/components/SlackSettings';

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
  company_status_change_slack: boolean;
  follow_up_assigned_slack: boolean;
  note_tagged_slack: boolean;
  note_comment_received: boolean;
  note_comment_received_email: boolean;
  note_comment_received_slack: boolean;
  note_comment_thread: boolean;
  note_comment_thread_email: boolean;
  note_comment_thread_slack: boolean;
  note_reaction_received: boolean;
  note_reaction_received_email: boolean;
  note_reaction_received_slack: boolean;
  note_lets_talk: boolean;
  note_lets_talk_email: boolean;
  note_lets_talk_slack: boolean;
  comment_reaction_received: boolean;
  comment_reaction_received_email: boolean;
  comment_reaction_received_slack: boolean;
}

function formatMemberSince(raw: string | null): string {
  if (!raw) return '—';
  const d = new Date(raw.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ─── Section: Profile & Identity ─────────────────────────────────────────────

function ProfileSection({ onRefresh }: { onRefresh: () => void }) {
  const { user, patchUser } = useUser();
  const [repOptions, setRepOptions] = useState<ConfigOption[]>([]);
  const [displayName, setDisplayName] = useState<string>(() => user?.displayName ?? '');
  const [configId, setConfigId] = useState<number | ''>(() => user?.configId ?? '');
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

  // Auto-select and silently save the rep profile when it isn't set but a
  // config_options entry exists whose value matches the user's display name.
  // Covers existing users who activated before the auto-link was added.
  useEffect(() => {
    if (configId !== '' || repOptions.length === 0 || !user) return;
    const nameToMatch = (user.displayName ?? '').toLowerCase().trim();
    if (!nameToMatch) return;
    const match = repOptions.find(opt => opt.value.toLowerCase().trim() === nameToMatch);
    if (!match) return;
    setConfigId(match.id);
    fetch('/api/auth/update-profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configId: match.id }),
    }).catch(() => {});
  }, [repOptions, user, configId]);

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
      // Optimistically update context so other parts of the app see the new values immediately,
      // regardless of Turso replica sync lag on the subsequent me fetch.
      const savedConfigId = configId !== '' ? Number(configId) : null;
      const savedRepName = repOptions.find(o => o.id === savedConfigId)?.value ?? null;
      patchUser({
        displayName: displayName.trim() || null,
        configId: savedConfigId,
        repName: savedRepName,
      });
      onRefresh(); // background refresh to pick up any other derived fields
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

function Toggle({ checked, disabled, muted, onClick }: { checked: boolean; disabled: boolean; muted?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      // `muted` is "this can never deliver", which needs to look inert.
      // `disabled` alone is also true for the moment a save is in flight, and
      // fading every toggle on every tap would read as breakage.
      className={`relative flex-shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary ${
        checked ? 'bg-brand-secondary' : 'bg-gray-200'
      } ${muted ? 'opacity-40 cursor-not-allowed' : ''}`}
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

/** Whether this user has somewhere for a Slack message to go. */
interface SlackDelivery {
  workspaceInstalled: boolean;
  linked: boolean;
}

// Static — defined outside the component so the suggestion effect below has a
// stable dependency rather than a new array on every render.
type PrefItem = { key: keyof NotifPrefs; emailKey: keyof NotifPrefs; slackKey: keyof NotifPrefs; label: string; description: string };

const prefItemsOptOut: PrefItem[] = [
  { key: 'company_status_change', emailKey: 'company_status_change_email', slackKey: 'company_status_change_slack', label: 'Company Status Changes', description: 'When a company you\'re assigned to changes status.' },
  { key: 'follow_up_assigned', emailKey: 'follow_up_assigned_email', slackKey: 'follow_up_assigned_slack', label: 'Follow-up Assigned', description: 'When a follow-up task is assigned to you.' },
  { key: 'note_tagged', emailKey: 'note_tagged_email', slackKey: 'note_tagged_slack', label: 'Note Mentions', description: 'When someone @mentions you in a note.' },
];

const prefItemsOptIn: PrefItem[] = [
  { key: 'note_comment_received', emailKey: 'note_comment_received_email', slackKey: 'note_comment_received_slack', label: 'Comment on My Note', description: 'When someone comments on a note you wrote.' },
  { key: 'note_comment_thread', emailKey: 'note_comment_thread_email', slackKey: 'note_comment_thread_slack', label: 'Thread Update', description: 'When a new comment is added to a note thread you\'ve joined.' },
  { key: 'note_reaction_received', emailKey: 'note_reaction_received_email', slackKey: 'note_reaction_received_slack', label: 'Note Reaction', description: 'When someone likes or dislikes your note.' },
  { key: 'note_lets_talk', emailKey: 'note_lets_talk_email', slackKey: 'note_lets_talk_slack', label: 'Let\'s Talk', description: 'When the Let\'s Talk button is triggered on a note you\'re involved in.' },
  { key: 'comment_reaction_received', emailKey: 'comment_reaction_received_email', slackKey: 'comment_reaction_received_slack', label: 'Comment Reaction', description: 'When someone likes or dislikes your comment.' },
];

const allItems = [...prefItemsOptOut, ...prefItemsOptIn];

function NotificationPrefsSection() {
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [slack, setSlack] = useState<SlackDelivery | null>(null);
  // Set once, on the render after a link just completed — see the suggestion
  // panel below.
  const [suggesting, setSuggesting] = useState(false);
  const [suggested, setSuggested] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch('/api/notification-preferences')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setPrefs(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/slack/status')
      .then(r => r.ok ? r.json() : null)
      .then((data: { workspace: unknown; link: unknown } | null) => {
        setSlack(data ? { workspaceInstalled: Boolean(data.workspace), linked: Boolean(data.link) } : null);
      })
      .catch(() => setSlack(null));
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


  // A Slack toggle that cannot deliver is worse than no toggle: it reads as a
  // promise. Until there is a link, the column is present but inert, and the
  // note below says whose job the missing piece is.
  const slackDeliverable = slack?.linked === true;

  // ── The suggestion, offered once, right after a link ───────────────────────
  //
  // Linking is a strong signal that someone wants Slack notifications, and
  // making them then hunt through this table is friction immediately after they
  // did us a favour. So the toggles are PRE-CHECKED from their current in-app
  // settings — the closest thing we have to a statement of what they care about
  // — and nothing is written until they press Turn these on. A silent write
  // here would be the same mistake as an opt-out default, just faster.
  useEffect(() => {
    if (!prefs || !slackDeliverable || suggesting) return;
    if (!readSlackCallback().connected) return;
    // Nothing to suggest if they already have Slack turned on somewhere: they
    // have been here before and made a choice.
    if (allItems.some(item => prefs[item.slackKey])) { clearSlackCallback(); return; }
    const initial: Record<string, boolean> = {};
    for (const item of allItems) initial[item.slackKey] = Boolean(prefs[item.key]);
    setSuggested(initial);
    setSuggesting(true);
  }, [prefs, slackDeliverable, suggesting, allItems]);

  const dismissSuggestion = () => {
    clearSlackCallback();
    setSuggesting(false);
  };

  const applySuggestion = async () => {
    if (!prefs) return;
    const chosen = Object.fromEntries(Object.entries(suggested).filter(([, on]) => on));
    if (Object.keys(chosen).length === 0) { dismissSuggestion(); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/notification-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chosen),
      });
      if (!res.ok) { toast.error('Failed to save preferences.'); return; }
      setPrefs({ ...prefs, ...chosen });
      toast.success('Slack notifications turned on.');
      dismissSuggestion();
    } catch {
      toast.error('Network error.');
    } finally {
      setSaving(false);
    }
  };

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
            <span className={`text-[11px] font-semibold uppercase tracking-wide ${slackDeliverable ? 'text-gray-400' : 'text-gray-300'}`} style={{ width: '40px', textAlign: 'center' }}>Slack</span>
          </div>

          {/* Why the Slack column is inert. Says whose job the missing piece is,
              because the two reasons have different people fixing them. */}
          {slack && !slackDeliverable && (
            <p className="text-xs text-gray-400 -mt-2">
              {slack.workspaceInstalled
                ? 'Slack notifications need your Slack account linked. Connect it in the Slack section above.'
                : 'Slack notifications need a workspace connected by an administrator first.'}
            </p>
          )}

          {suggesting && (
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-800">Turn on Slack notifications?</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Your Slack account is linked. These match your in-app settings — nothing is saved until you confirm.
                </p>
              </div>
              <div className="space-y-1.5">
                {allItems.map(({ slackKey, label }) => (
                  <label key={slackKey} className="flex items-center gap-2 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={Boolean(suggested[slackKey])}
                      onChange={e => setSuggested(prev => ({ ...prev, [slackKey]: e.target.checked }))}
                      className="rounded border-gray-300"
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={applySuggestion} disabled={saving} className="btn-primary text-xs">
                  {saving ? 'Saving…' : 'Turn these on'}
                </button>
                <button type="button" onClick={dismissSuggestion} className="text-xs text-gray-500 font-medium hover:underline">
                  Not now
                </button>
              </div>
            </div>
          )}

          {/* Opt-out section */}
          <div className="space-y-4">
            {prefItemsOptOut.map(({ key, emailKey, slackKey, label, description }) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-800">{label}</p>
                  <p className="text-xs text-gray-400">{description}</p>
                </div>
                <div className="flex items-center gap-6 flex-shrink-0">
                  <Toggle checked={prefs[key]} disabled={saving} onClick={() => toggle(key)} />
                  <Toggle checked={prefs[emailKey]} disabled={saving} onClick={() => toggle(emailKey)} />
                  {/* Off, not on, even though the two toggles to its left default
                      to on for these three events. No row means no Slack. */}
                  <Toggle checked={prefs[slackKey]} disabled={saving || !slackDeliverable} muted={!slackDeliverable} onClick={() => toggle(slackKey)} />
                </div>
              </div>
            ))}
          </div>

          {/* Note engagement section */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Note Engagement</p>
            <div className="space-y-4">
              {prefItemsOptIn.map(({ key, emailKey, slackKey, label, description }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{label}</p>
                    <p className="text-xs text-gray-400">{description}</p>
                  </div>
                  <div className="flex items-center gap-6 flex-shrink-0">
                    <Toggle checked={prefs[key]} disabled={saving} onClick={() => toggle(key)} />
                    <Toggle checked={prefs[emailKey]} disabled={saving} onClick={() => toggle(emailKey)} />
                    <Toggle checked={prefs[slackKey]} disabled={saving || !slackDeliverable} muted={!slackDeliverable} onClick={() => toggle(slackKey)} />
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

// ─── Section: Email Signature ─────────────────────────────────────────────────

function EmailSignatureSection() {
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const editor = useEditor({
    // This page is server-rendered before it hydrates, and Tiptap throws on
    // sight of that unless told to hold off until the client. Without this the
    // whole of My Account falls into the error boundary in development —
    // production happens to escape it, which is why it went unnoticed.
    immediatelyRender: false,
    extensions: getEditorExtensions({ withImage: true }),
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[120px] p-3 focus:outline-none',
      },
    },
  });

  useEffect(() => {
    if (!editor || loaded) return;
    fetch('/api/user/signature')
      .then(r => r.ok ? r.json() : { signature: '' })
      .then((data: { signature: string }) => {
        if (data.signature) editor.commands.setContent(data.signature);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [editor, loaded]);

  const handleSave = async () => {
    if (!editor) return;
    setSaving(true);
    try {
      const res = await fetch('/api/user/signature', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature_html: editor.getHTML() }),
      });
      if (!res.ok) throw new Error();
      toast.success('Signature saved.');
    } catch {
      toast.error('Failed to save signature.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-brand-primary font-serif mb-1">Email Signature</h2>
      <p className="text-xs text-gray-400 mb-3">
        Automatically appended to every new email you compose. Supports rich formatting and your logo.
      </p>
      <RichTextEditor editor={editor} withImage minHeight="120px" />
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !loaded}
          className="btn-primary text-sm"
        >
          {saving ? 'Saving…' : 'Save Signature'}
        </button>
      </div>
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
      const clerkSignOut = (window as Window & { Clerk?: { signOut: (o: { redirectUrl: string }) => Promise<void> } }).Clerk?.signOut;
      if (clerkSignOut) {
        await clerkSignOut({ redirectUrl: '/auth/login' });
      } else {
        window.location.href = '/auth/login';
      }
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
      <EmailSignatureSection />
      <SlackAccountSection />
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
