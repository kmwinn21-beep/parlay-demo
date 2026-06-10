'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { LogoImage } from '@/components/LogoImage';

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function SignupPage() {
  const router = useRouter();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [domainConflict, setDomainConflict] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [conferenceTimingAnswer, setConferenceTimingAnswer] = useState<'upcoming' | 'planning' | ''>('');
  const [loading, setLoading] = useState(false);
  const [showSurvey, setShowSurvey] = useState(false);
  const [signupRole, setSignupRole] = useState('');
  const [signupIndustry, setSignupIndustry] = useState('');
  const [signupTeamSize, setSignupTeamSize] = useState('');
  const [signupConferencesPerYear, setSignupConferencesPerYear] = useState('');
  const [signupPrimaryGoal, setSignupPrimaryGoal] = useState('');
  const [signupCurrentTool, setSignupCurrentTool] = useState('');

  const handleEmailBlur = useCallback(async () => {
    setDomainConflict(false);
    const atIdx = email.indexOf('@');
    if (atIdx === -1 || !email.slice(atIdx + 1)) return;
    try {
      const res = await fetch(`/api/auth/check-domain?email=${encodeURIComponent(email)}`);
      const data = await res.json() as { conflict: boolean };
      setDomainConflict(data.conflict);
    } catch {
      // Non-fatal — just don't show the warning
    }
  }, [email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conferenceTimingAnswer) {
      toast.error('Please answer the conference timing question.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/trial-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName, lastName, email, companyName, conferenceTimingAnswer,
          // Only include password for legacy (non-Clerk) deployments
          ...(!CLERK_ENABLED && { password }),
          signupRole: signupRole || undefined,
          signupIndustry: signupIndustry || undefined,
          signupTeamSize: signupTeamSize || undefined,
          signupConferencesPerYear: signupConferencesPerYear || undefined,
          signupPrimaryGoal: signupPrimaryGoal || undefined,
          signupCurrentTool: signupCurrentTool || undefined,
        }),
      });
      const data = await res.json() as { success?: boolean; redirectTo?: string; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? 'Signup failed.');
        return;
      }
      // In Clerk mode, redirectTo points to /auth/signup (Clerk's hosted sign-up).
      // In legacy mode, redirectTo points to /?welcome=true with a session cookie set.
      window.location.href = data.redirectTo ?? '/';
    } catch {
      toast.error('Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <LogoImage variant="dark" className="h-10 w-auto" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h1 className="text-2xl font-bold text-gray-900 font-serif mb-1">Start your free trial</h1>
          <p className="text-sm text-gray-500 mb-6">14 days free. No credit card required.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  required
                  autoComplete="given-name"
                  className="input-field w-full"
                  placeholder="Jane"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  required
                  autoComplete="family-name"
                  className="input-field w-full"
                  placeholder="Smith"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Work email</label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setDomainConflict(false); }}
                onBlur={handleEmailBlur}
                required
                autoComplete="email"
                className="input-field w-full"
                placeholder="jane@company.com"
              />
              {domainConflict && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                  <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  <span>
                    It looks like your company may already have a Parlay account.{' '}
                    <a href="/auth/login" className="font-semibold underline underline-offset-2 hover:text-amber-900">Sign in instead</a>
                    {' '}or contact your account admin. You can still continue below.
                  </span>
                </div>
              )}
            </div>

            {!CLERK_ENABLED && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="input-field w-full"
                  placeholder="8+ characters"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company name</label>
              <input
                type="text"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                required
                autoComplete="organization"
                className="input-field w-full"
                placeholder="Acme Corp"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Do you have a conference coming up in the next 90 days?
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setConferenceTimingAnswer('upcoming')}
                  className={`py-3 px-4 rounded-xl border-2 text-sm font-medium transition-colors ${
                    conferenceTimingAnswer === 'upcoming'
                      ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Yes, I do
                </button>
                <button
                  type="button"
                  onClick={() => setConferenceTimingAnswer('planning')}
                  className={`py-3 px-4 rounded-xl border-2 text-sm font-medium transition-colors ${
                    conferenceTimingAnswer === 'planning'
                      ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Not yet
                </button>
              </div>
            </div>

            {/* Optional survey */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowSurvey(s => !s)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100"
              >
                <span>Tell us about your team <span className="text-gray-400 font-normal">(optional)</span></span>
                <span className="text-gray-400">{showSurvey ? '▲' : '▼'}</span>
              </button>
              {showSurvey && (
                <div className="px-4 py-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <select value={signupRole} onChange={e => setSignupRole(e.target.value)} className="input-field w-full">
                      <option value="">Select…</option>
                      {['Sales', 'Marketing', 'Events', 'Revenue Operations', 'Executive', 'Other'].map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                    <input
                      type="text"
                      value={signupIndustry}
                      onChange={e => setSignupIndustry(e.target.value)}
                      className="input-field w-full"
                      placeholder="e.g. SaaS, Financial Services"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Revenue team size</label>
                    <select value={signupTeamSize} onChange={e => setSignupTeamSize(e.target.value)} className="input-field w-full">
                      <option value="">Select…</option>
                      {['1-5', '6-15', '16-50', '50+'].map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Annual conferences attended</label>
                    <select value={signupConferencesPerYear} onChange={e => setSignupConferencesPerYear(e.target.value)} className="input-field w-full">
                      <option value="">Select…</option>
                      {['1-3', '4-10', '11-25', '25+'].map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Primary conference goal</label>
                    <select value={signupPrimaryGoal} onChange={e => setSignupPrimaryGoal(e.target.value)} className="input-field w-full">
                      <option value="">Select…</option>
                      {['Pipeline generation', 'Customer retention', 'Brand awareness', 'Recruiting', 'Other'].map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Current conference management tool</label>
                    <input
                      type="text"
                      value={signupCurrentTool}
                      onChange={e => setSignupCurrentTool(e.target.value)}
                      className="input-field w-full"
                      placeholder="Spreadsheets, Salesforce, HubSpot, etc."
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !conferenceTimingAnswer}
              className="btn-primary w-full py-3 mt-2"
            >
              {loading ? 'Creating your account…' : 'Start free trial'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-brand-primary font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          By signing up, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
