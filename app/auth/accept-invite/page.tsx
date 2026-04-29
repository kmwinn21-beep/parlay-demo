'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LogoImage } from '@/components/LogoImage';

export default function AcceptInvitePage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [status, setStatus] = useState<'loading' | 'ready' | 'done' | 'error'>('loading');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setStatus('error'); setErrorMsg('No invitation token found in this link.'); return; }
    fetch(`/api/auth/accept-invite?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setStatus('error'); setErrorMsg(data.error); return; }
        setEmail(data.email);
        setFirstName(data.firstName);
        setStatus('ready');
      })
      .catch(() => { setStatus('error'); setErrorMsg('Failed to validate invitation. Please try again.'); });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setErrorMsg('Passwords do not match.'); return; }
    setErrorMsg('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error ?? 'Something went wrong.'); return; }
      setStatus('done');
      setTimeout(() => { window.location.href = '/'; }, 1500);
    } catch {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-primary flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <LogoImage variant="sidebar" width={160} height={48} className="object-contain mb-2" alt="Logo" />
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {status === 'loading' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="w-8 h-8 animate-spin rounded-full border-4 border-brand-secondary border-t-transparent" />
              <p className="text-sm text-gray-500">Validating your invitation…</p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h1 className="text-lg font-bold text-brand-primary font-serif mb-2">Invitation Invalid</h1>
              <p className="text-sm text-gray-500">{errorMsg}</p>
            </div>
          )}

          {status === 'done' && (
            <div className="text-center">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-lg font-bold text-brand-primary font-serif mb-2">You&apos;re all set!</h1>
              <p className="text-sm text-gray-500">Redirecting you to the dashboard…</p>
            </div>
          )}

          {status === 'ready' && (
            <>
              <h1 className="text-2xl font-bold text-brand-primary font-serif mb-1">
                Welcome{firstName ? `, ${firstName}` : ''}!
              </h1>
              <p className="text-sm text-gray-500 mb-6">
                You&apos;ve been invited to join. Set your password to activate your account.
              </p>

              <div className="mb-4 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-0.5">Signing in as</p>
                <p className="text-sm font-medium text-gray-700">{email}</p>
              </div>

              {errorMsg && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">{errorMsg}</p>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-secondary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat password"
                    required
                    autoComplete="new-password"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-secondary focus:border-transparent"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-brand-secondary text-white rounded-lg font-semibold text-sm hover:bg-brand-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {submitting ? 'Activating…' : 'Activate Account'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
