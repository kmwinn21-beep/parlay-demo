'use client';
import { useState } from 'react';
import { BundleBuilder } from '@/components/BundleBuilder';

export default function UpgradePage() {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('annual');

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 font-serif">Build your plan</h1>
        <p className="text-gray-500 text-sm mt-1">
          Start with Essentials and add only the feature bundles your team needs.
        </p>
      </div>

      <div className="flex justify-center mb-6">
        <div className="inline-flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setBilling('monthly')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              billing === 'monthly'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling('annual')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
              billing === 'annual'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Annual
            <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
              Save 20%
            </span>
          </button>
        </div>
      </div>

      <BundleBuilder billing={billing} />
    </div>
  );
}
