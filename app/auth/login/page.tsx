'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import toast from 'react-hot-toast';
import { SignIn } from '@clerk/nextjs';
import { LogoImage } from '@/components/LogoImage';
import { useTagline } from '@/lib/useTagline';

// When NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is set at build time, delegate to
// Clerk's hosted sign-in. Otherwise render the legacy JWT login form so that
// environments without Clerk configured (e.g. demo) continue to work.
const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const YEAR = new Date().getFullYear();

function BackgroundSVG() {
  return (
    <svg
      className="absolute inset-0 w-full h-full opacity-[0.07] pointer-events-none"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <line x1="200" y1="150" x2="450" y2="300" stroke="white" strokeWidth="1" />
      <line x1="450" y1="300" x2="700" y2="200" stroke="white" strokeWidth="1" />
      <line x1="700" y1="200" x2="900" y2="350" stroke="white" strokeWidth="1" />
      <line x1="450" y1="300" x2="350" y2="550" stroke="white" strokeWidth="1" />
      <line x1="350" y1="550" x2="600" y2="620" stroke="white" strokeWidth="1" />
      <line x1="600" y1="620" x2="850" y2="500" stroke="white" strokeWidth="1" />
      <line x1="900" y1="350" x2="850" y2="500" stroke="white" strokeWidth="1" />
      <line x1="700" y1="200" x2="600" y2="620" stroke="white" strokeWidth="0.5" />
      <line x1="100" y1="400" x2="350" y2="550" stroke="white" strokeWidth="1" />
      <line x1="100" y1="400" x2="200" y2="150" stroke="white" strokeWidth="0.5" />
      <line x1="1050" y1="200" x2="900" y2="350" stroke="white" strokeWidth="1" />
      <line x1="1050" y1="200" x2="1100" y2="500" stroke="white" strokeWidth="1" />
      <line x1="1100" y1="500" x2="850" y2="500" stroke="white" strokeWidth="1" />
      <line x1="150" y1="680" x2="350" y2="550" stroke="white" strokeWidth="1" />
      <line x1="150" y1="680" x2="600" y2="620" stroke="white" strokeWidth="0.5" />
      <circle cx="200" cy="150" r="5" fill="white" />
      <circle cx="450" cy="300" r="7" fill="white" />
      <circle cx="700" cy="200" r="6" fill="white" />
      <circle cx="900" cy="350" r="8" fill="white" />
      <circle cx="350" cy="550" r="6" fill="white" />
      <circle cx="600" cy="620" r="7" fill="white" />
      <circle cx="850" cy="500" r="5" fill="white" />
      <circle cx="100" cy="400" r="4" fill="white" />
      <circle cx="1050" cy="200" r="5" fill="white" />
      <circle cx="1100" cy="500" r="6" fill="white" />
      <circle cx="150" cy="680" r="4" fill="white" />
    </svg>
  );
}

function PageFooter() {
  return (
    <div className="mt-8 text-center text-white/40 text-xs space-y-1">
      <p>&copy; {YEAR} All Rights Reserved.</p>
      <p>
        <a href="https://www.useparlay.app/privacy" className="hover:text-white/70 transition-colors">Privacy Policy</a>
        {' '}and{' '}
        <a href="https://www.useparlay.app/terms" className="hover:text-white/70 transition-colors">Terms</a>
      </p>
    </div>
  );
}

function ClerkLoginPage() {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-brand-primary overflow-hidden">
      <BackgroundSVG />

      {/* Top-left logo */}
      <div className="absolute top-5 left-6 z-10">
        <Image src="/ParlayLogoWhite_New.png" alt="Parlay" height={25} width={0} style={{ width: 'auto', height: 25 }} unoptimized />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <SignIn
          signUpUrl="https://www.useparlay.app/?trial=true"
          appearance={{ elements: { headerTitle: 'hidden', headerSubtitle: 'hidden' } }}
        />
        <PageFooter />
      </div>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';
  const tagline = useTagline();

  const [email, setEmail] = useState(process.env.NEXT_PUBLIC_DEMO_EMAIL ?? '');
  const [password, setPassword] = useState(process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? '');
  const [loading, setLoading] = useState(false);

  // Redirect to setup if no users exist yet
  useEffect(() => {
    fetch('/api/auth/setup')
      .then(r => r.ok ? r.json() : { needsSetup: false })
      .then((data: { needsSetup: boolean }) => {
        if (data.needsSetup) router.replace('/auth/setup');
      })
      .catch(() => {});
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Login failed.');
        setLoading(false);
        return;
      }
      // Full page navigation ensures clean server state with the new auth cookie.
      window.location.href = (data as { redirectTo?: string }).redirectTo ?? next;
    } catch {
      toast.error('Network error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-brand-primary flex flex-col items-center justify-center p-4 overflow-hidden">
      <BackgroundSVG />

      {/* Top-left logo */}
      <div className="absolute top-5 left-6 z-10">
        <Image src="/ParlayLogoWhite_New.png" alt="Parlay" height={25} width={0} style={{ width: 'auto', height: 25 }} unoptimized />
      </div>

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
        <div className="flex flex-col items-center mb-8">
          <LogoImage variant="sidebar" width={160} height={48} className="object-contain mb-2" alt="Logo" />
          {tagline && <p className="text-white/60 text-sm italic">{tagline}</p>}
        </div>

        <div className="w-full bg-white rounded-2xl shadow-2xl p-8">
          <h1 className="text-2xl font-bold text-brand-primary font-serif mb-6">Welcome back</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={`you@${process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN ?? 'yourcompany.com'}`}
                required
                autoComplete="email"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-secondary focus:border-transparent"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Password
                </label>
                <Link href="/auth/forgot-password" className="text-xs text-brand-secondary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-secondary focus:border-transparent"
              />
            </div>
            {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && (
              <p className="text-xs text-center text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                Demo credentials are pre-filled — click Sign In to explore.
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-brand-secondary text-white rounded-lg font-semibold text-sm hover:bg-brand-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2 flex items-center justify-center gap-2"
            >
              {loading && (
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Don&apos;t have an account?{' '}
            <a href="https://www.useparlay.app/?trial=true" className="text-brand-secondary font-medium hover:underline">
              Sign up
            </a>
          </p>
        </div>

        {process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN && (
          <p className="text-center text-white/50 text-xs mt-4">
            Only @{process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN} accounts are permitted.
          </p>
        )}

        <PageFooter />
      </div>
    </div>
  );
}

export default function LoginPage() {
  if (CLERK_ENABLED) {
    return <ClerkLoginPage />;
  }
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
