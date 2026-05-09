'use client';

import Link from 'next/link';
import { LogoImage } from '@/components/LogoImage';

interface OnboardingLayoutProps {
  step: number;
  totalSteps: number;
  children: React.ReactNode;
}

export function OnboardingLayout({ step, totalSteps, children }: OnboardingLayoutProps) {
  const progress = (step / totalSteps) * 100;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <LogoImage variant="dark" className="h-8 w-auto" />
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">Step {step} of {totalSteps}</span>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
            Skip for now →
          </Link>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-100">
        <div
          className="h-full bg-brand-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Step dots */}
      <div className="flex justify-center gap-2 pt-4">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-colors ${
              i + 1 <= step ? 'bg-brand-primary' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-4 py-8">
        <div className="w-full max-w-lg">
          {children}
        </div>
      </div>
    </div>
  );
}
