'use client';

/**
 * The two Slack surfaces: the administrator's workspace section in Admin
 * Settings, and the individual user's row on My Account.
 *
 * They share a file because they share their source of truth — one GET of
 * /api/slack/status answers both — and because the states they can be in are
 * the same three: not configured, not installed, installed. Splitting them
 * would mean keeping two copies of that in step.
 *
 * Neither component sends anything to Slack. Connecting is a full page
 * navigation to /api/slack/install or /api/slack/connect, because it ends at
 * Slack's consent screen; disconnecting is a fetch, because it does not.
 */

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { slackErrorMessage } from '@/lib/slack/errorMessages';

interface SlackStatus {
  workspace: {
    teamId: string;
    teamName: string | null;
    installedBy: string | null;
    installedAt: string | null;
  } | null;
  link: { slackUserId: string } | null;
  encryptionConfigured: boolean;
}

function formatInstalledAt(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Read the callback's `error` / `connected` params and clear them from the URL.
 *
 * Read from `window.location` rather than `useSearchParams` deliberately: that
 * hook forces the whole page into a Suspense boundary at build time, and these
 * are two screens with a great deal else on them. The params are consumed once
 * on mount and then removed, so a refresh does not replay a stale message.
 */
function useCallbackResult(): { error: string | null; connected: boolean } {
  const [result, setResult] = useState<{ error: string | null; connected: boolean }>({
    error: null,
    connected: false,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const connected = params.get('connected') === 'slack';
    if (!error && !connected) return;
    setResult({ error, connected });
    params.delete('error');
    params.delete('connected');
    const query = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''));
  }, []);

  return result;
}

function Banner({ tone, children }: { tone: 'error' | 'success' | 'warning'; children: React.ReactNode }) {
  const styles = {
    error: 'bg-red-50 border-red-200 text-red-800',
    success: 'bg-green-50 border-green-200 text-green-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  }[tone];
  return <div className={`p-3 rounded-lg border text-xs font-medium ${styles}`}>{children}</div>;
}

function useSlackStatus() {
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch('/api/slack/status')
      .then(r => (r.ok ? r.json() : null))
      .then((data: SlackStatus | null) => setStatus(data))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  return { status, loading, reload: load };
}

// ─── Admin Settings ──────────────────────────────────────────────────────────

export function SlackAdminSection() {
  const { status, loading, reload } = useSlackStatus();
  const { error, connected } = useCallbackResult();
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/slack/disconnect', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error ?? 'Failed to disconnect Slack.');
        return;
      }
      toast.success('Slack disconnected.');
      setConfirming(false);
      reload();
    } catch {
      toast.error('Network error.');
    } finally {
      setDisconnecting(false);
    }
  };

  const workspace = status?.workspace ?? null;
  const installedAt = formatInstalledAt(workspace?.installedAt ?? null);

  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <div>
          <h2 className="text-base font-semibold text-brand-primary font-serif mb-1">Slack</h2>
          <p className="text-sm text-gray-500">
            Connect your Slack workspace so notifications can be delivered there. Everyone on your
            account then links their own Slack account from My Account.
          </p>
        </div>

        {error && <Banner tone="error">{slackErrorMessage(error)}</Banner>}
        {connected && !error && <Banner tone="success">Slack workspace connected.</Banner>}

        {/* The one failure nobody can diagnose from a generic error message. */}
        {status && !status.encryptionConfigured && (
          <Banner tone="warning">
            ENCRYPTION_KEY is not set on this deployment, so a Slack token cannot be stored securely.
            Connecting will fail at the last step until it is set to 64 hexadecimal characters
            (<span className="font-mono">openssl rand -hex 32</span>).
          </Banner>
        )}

        {loading ? (
          <div className="h-20 bg-gray-100 rounded animate-pulse" />
        ) : !status ? (
          <p className="text-sm text-gray-500">Could not load the Slack connection status.</p>
        ) : workspace ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                Connected
              </span>
              <span className="text-sm font-medium text-gray-800">
                {workspace.teamName ?? workspace.teamId}
              </span>
            </div>

            <dl className="space-y-2">
              <div>
                <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Connected by</dt>
                <dd className="text-sm text-gray-800 mt-0.5">{workspace.installedBy ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Connected on</dt>
                <dd className="text-sm text-gray-800 mt-0.5">{installedAt ?? '—'}</dd>
              </div>
            </dl>

            {confirming ? (
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                <p className="text-xs text-gray-600">
                  Disconnecting removes the workspace and every linked Slack account on this account.
                  Nobody will receive Slack notifications until an administrator connects it again.
                </p>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={handleDisconnect} disabled={disconnecting} className="btn-danger text-xs">
                    {disconnecting ? 'Disconnecting…' : 'Yes, disconnect'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="text-xs text-gray-500 font-medium hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <a href="/api/slack/install" className="btn-secondary text-sm">Reconnect</a>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="text-sm text-red-600 font-medium hover:underline"
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
              Not connected
            </span>
            <p className="text-sm text-gray-500">
              You will be taken to Slack to choose a workspace and approve access.
            </p>
            <a href="/api/slack/install" className="btn-primary text-sm inline-block">Connect Slack</a>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── My Account ──────────────────────────────────────────────────────────────

export function SlackAccountSection() {
  const { status, loading, reload } = useSlackStatus();
  const { error, connected } = useCallbackResult();
  const [disconnecting, setDisconnecting] = useState(false);

  // The connect routes redirect to /auth/account?section=slack, and this card
  // is well below the fold. Scroll to it once the content that carries the
  // message has actually rendered — before that there is only a placeholder,
  // and scrolling to a placeholder lands in the wrong place when it resizes.
  useEffect(() => {
    if (loading) return;
    if (new URLSearchParams(window.location.search).get('section') !== 'slack') return;
    document.getElementById('slack')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [loading]);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/slack/disconnect/me', { method: 'POST' });
      if (!res.ok) {
        toast.error('Failed to disconnect Slack.');
        return;
      }
      toast.success('Slack account unlinked.');
      reload();
    } catch {
      toast.error('Network error.');
    } finally {
      setDisconnecting(false);
    }
  };

  // Only the Slack callback's own params belong to this section. Without this,
  // an unrelated `?error=` elsewhere on the account page would surface here as
  // a Slack failure.
  let slackError = error && error.startsWith('slack_') ? error : null;

  // slack_no_workspace and the not-installed body say the same thing. Showing
  // both stacks two paragraphs of identical news; the body is the one that
  // stays on the screen afterwards, so the banner is the one to drop.
  if (slackError === 'slack_no_workspace' && !status?.workspace) slackError = null;

  if (loading) {
    return (
      <div className="card" id="slack">
        <h2 className="text-base font-semibold text-brand-primary font-serif mb-3">Slack</h2>
        <div className="h-12 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  // No status at all means the request failed, not that Slack is unavailable.
  // Saying nothing is better than asserting something untrue about the account.
  if (!status) return null;

  return (
    <div className="card space-y-3" id="slack">
      <div>
        <h2 className="text-base font-semibold text-brand-primary font-serif mb-1">Slack</h2>
        <p className="text-xs text-gray-400">
          Link your Slack account to receive notifications as direct messages.
        </p>
      </div>

      {slackError && <Banner tone="error">{slackErrorMessage(slackError)}</Banner>}
      {connected && !slackError && <Banner tone="success">Slack account linked.</Banner>}

      {!status.workspace ? (
        // No workspace: explain, and offer no control. A Connect button here
        // would go to Slack and come back with an error nobody can act on,
        // because the fix belongs to an administrator, not to this user.
        <p className="text-sm text-gray-500">
          Your account is not connected to a Slack workspace yet. An administrator connects the
          workspace first, in Admin Settings — then you can link your own Slack account here.
        </p>
      ) : status.link ? (
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-800 flex items-center gap-2">
              Connected
              <span className="text-xs text-green-600 font-medium">
                {status.workspace.teamName ?? status.workspace.teamId}
              </span>
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Slack member <span className="font-mono">{status.link.slackUserId}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="text-xs text-red-600 font-medium hover:underline flex-shrink-0"
          >
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            Sign in to <span className="font-medium text-gray-800">{status.workspace.teamName ?? status.workspace.teamId}</span> to
            link your account.
          </p>
          <a href="/api/slack/connect" className="btn-primary text-sm flex-shrink-0">Connect</a>
        </div>
      )}
    </div>
  );
}
