'use client';

import Link from 'next/link';
import { LogoImage } from '@/components/LogoImage';

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-brand-primary flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <LogoImage variant="sidebar" width={160} height={48} className="object-contain mb-2" alt="Logo" />
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-12 h-12 bg-brand-secondary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-brand-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-brand-primary font-serif mb-2">Invitation Only</h1>
          <p className="text-sm text-gray-500 mb-6">
            Account registration is by invitation only. Please contact an administrator to request access.
          </p>
          <Link
            href="/auth/login"
            className="inline-block w-full py-3 bg-brand-secondary text-white rounded-lg font-semibold text-sm hover:bg-brand-primary transition-colors"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
