'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LogoImage } from '@/components/LogoImage';

type Status = 'loading' | 'success' | 'error';

function VerifyEmailChangeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No verification token found in this link.');
      return;
    }

    fetch('/api/auth/verify-email-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => res.json().then((d) => ({ ok: res.ok, data: d })))
      .then(({ ok, data }) => {
        if (ok) {
          setStatus('success');
          setMessage(data.message || 'Email updated!');
          setTimeout(() => { window.location.href = '/auth/account'; }, 2000);
        } else {
          setStatus('error');
          setMessage(data.error || 'Verification failed.');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('Network error. Please try again.');
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-procare-dark-blue flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <LogoImage variant="white" width={160} height={48} className="object-contain mb-2" alt="Logo" />
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
          {status === 'loading' && (
            <>
              <div className="animate-spin w-10 h-10 border-4 border-procare-bright-blue border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-gray-600">Confirming your new email address…</p>
            </>
          )}
          {status === 'success' && (
            <>
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-procare-dark-blue font-serif mb-2">Email updated!</h2>
              <p className="text-sm text-gray-500">Redirecting you to your account…</p>
            </>
          )}
          {status === 'error' && (
            <>
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-procare-dark-blue font-serif mb-2">Verification failed</h2>
              <p className="text-sm text-gray-500 mb-5">{message}</p>
              <div className="space-y-2">
                <Link href="/auth/account" className="block text-procare-bright-blue text-sm font-medium hover:underline">
                  Back to account →
                </Link>
                <Link href="/auth/login" className="block text-gray-400 text-sm hover:underline">
                  Sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailChangePage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailChangeContent />
    </Suspense>
  );
}
