'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from './UserContext';
import { QA_TEST_EMAIL, type CheckoutPlanId, type BillingInterval } from '@/lib/constants';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  defaultPlan?: Exclude<CheckoutPlanId, 'custom'>;
};

const PLANS: {
  id: Exclude<CheckoutPlanId, 'custom'>;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  description: string;
  highlights: string[];
}[] = [
  {
    id: 'essentials',
    name: 'Essentials',
    monthlyPrice: 299,
    annualPrice: 239,
    description: 'Core conference tracking for growing teams.',
    highlights: [
      'Conference & attendee management',
      'Meeting & follow-up tracking',
      'Agenda & social event management',
      'User management',
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    monthlyPrice: 699,
    annualPrice: 559,
    description: 'Full intelligence suite for serious conference programs.',
    highlights: [
      'Everything in Essentials',
      'ICP scoring & target recommendations',
      'AI card scanning & floor capture',
      'Revenue intelligence & analytics',
      'Team collaboration & messaging',
      'CRM export & email integrations',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: 1399,
    annualPrice: 1119,
    description: 'Program-level intelligence across your entire org.',
    highlights: [
      'Everything in Professional',
      'Global reporting & cross-conference trends',
      'Brand customization & white-label',
      'Advanced role & scope controls',
      'Lead capture & form builder',
    ],
  },
];

export function PlanSelectionModal({ isOpen, onClose, defaultPlan }: Props) {
  const { user } = useUser();
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('annual');
  const [selectedPlan, setSelectedPlan] = useState<Exclude<CheckoutPlanId, 'custom'> | null>(
    defaultPlan ?? null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!isOpen) return null;

  // QA bypass — never open for the test account
  if (user?.email?.toLowerCase() === QA_TEST_EMAIL.toLowerCase()) return null;

  async function handlePlanSelect(planId: Exclude<CheckoutPlanId, 'custom'>) {
    setIsLoading(true);
    setSelectedPlan(planId);
    setError(null);
    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, billingInterval }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Checkout failed');
      window.location.href = data.url;
    } catch (err) {
      setError('Something went wrong. Please try again.');
      setIsLoading(false);
      setSelectedPlan(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Choose a plan</h2>
            <p className="text-sm text-gray-500 mt-0.5">Unlock full access to Parlay</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Billing toggle */}
        <div className="flex justify-center pt-5 pb-2">
          <div className="inline-flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setBillingInterval('monthly')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                billingInterval === 'monthly'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingInterval('annual')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                billingInterval === 'annual'
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

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6">
          {PLANS.map(plan => {
            const price = billingInterval === 'annual' ? plan.annualPrice : plan.monthlyPrice;
            const isLoadingThis = isLoading && selectedPlan === plan.id;
            const isProfessional = plan.id === 'professional';

            return (
              <div
                key={plan.id}
                className={`relative rounded-xl border-2 p-5 flex flex-col ${
                  isProfessional
                    ? 'border-brand-primary bg-brand-primary/5'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {isProfessional && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-brand-primary text-white text-xs font-semibold px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-4">
                  <h3 className="text-base font-bold text-gray-900">{plan.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{plan.description}</p>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-gray-900">${price}</span>
                    <span className="text-sm text-gray-500">/mo</span>
                  </div>
                  {billingInterval === 'annual' && (
                    <p className="text-xs text-gray-400 mt-0.5">billed annually</p>
                  )}
                </div>

                <ul className="flex-1 space-y-2 mb-5">
                  {plan.highlights.map(item => (
                    <li key={item} className="flex items-start gap-2 text-xs text-gray-600">
                      <svg
                        className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handlePlanSelect(plan.id)}
                  disabled={isLoading}
                  className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold transition-opacity ${
                    isProfessional
                      ? 'bg-brand-primary text-white hover:opacity-90'
                      : 'bg-gray-900 text-white hover:opacity-80'
                  } disabled:opacity-60`}
                >
                  {isLoadingThis ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Redirecting…
                    </span>
                  ) : (
                    `Get ${plan.name}`
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <p className="text-center text-sm text-red-600 px-6 pb-2">{error}</p>
        )}

        {/* Custom plan link */}
        <div className="text-center pb-6 px-6">
          <button
            onClick={() => { onClose(); router.push('/upgrade'); }}
            className="text-sm text-brand-primary hover:underline font-medium bg-transparent border-0 cursor-pointer p-0"
          >
            Need a custom plan? Build your own →
          </button>
        </div>
      </div>
    </div>
  );
}
