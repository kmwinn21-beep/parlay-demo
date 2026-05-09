'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';

const TOTAL_STEPS = 5;

export default function TrackAOnboarding() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Conference form
  const [confName, setConfName] = useState('');
  const [confStartDate, setConfStartDate] = useState('');
  const [confEndDate, setConfEndDate] = useState('');
  const [confCity, setConfCity] = useState('');
  const [createdConferenceId, setCreatedConferenceId] = useState<number | null>(null);

  // ICP form
  const [companyType, setCompanyType] = useState('');
  const [unitType, setUnitType] = useState('');

  const [saving, setSaving] = useState(false);

  const handleCreateConference = async () => {
    if (!confName) { toast.error('Conference name is required.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/conferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: confName, start_date: confStartDate, end_date: confEndDate, city: confCity }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { id?: number };
      if (data.id) setCreatedConferenceId(data.id);
      setStep(3);
    } catch {
      toast.error('Failed to create conference. You can add it later.');
      setStep(3);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveIcp = async () => {
    setSaving(true);
    try {
      if (companyType || unitType) {
        await fetch('/api/admin/icp-rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company_type: companyType, unit_type: unitType }),
        }).catch(() => {});
      }
      setStep(4);
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    // Mark onboarding as completed
    await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'onboarding_completed', value: 'true' }),
    }).catch(() => {});
    setStep(5);
  };

  return (
    <OnboardingLayout step={step} totalSteps={TOTAL_STEPS}>
      {/* Step 1: Welcome */}
      {step === 1 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-sm">
          <div className="w-16 h-16 bg-brand-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 font-serif mb-2">Welcome to Parlay!</h1>
          <p className="text-gray-500 mb-6">
            Let&apos;s get your first conference ready. We&apos;ll walk you through setting up in just a few steps.
          </p>
          <button onClick={() => setStep(2)} className="btn-primary w-full py-3">
            Let&apos;s Go →
          </button>
        </div>
      )}

      {/* Step 2: Conference details */}
      {step === 2 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 font-serif mb-1">Add your conference</h2>
          <p className="text-sm text-gray-500 mb-5">Tell us about the upcoming event.</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Conference name <span className="text-red-500">*</span></label>
              <input type="text" value={confName} onChange={e => setConfName(e.target.value)} className="input-field w-full" placeholder="e.g. SaaStr Annual 2025" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
                <input type="date" value={confStartDate} onChange={e => setConfStartDate(e.target.value)} className="input-field w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End date</label>
                <input type="date" value={confEndDate} onChange={e => setConfEndDate(e.target.value)} className="input-field w-full" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input type="text" value={confCity} onChange={e => setConfCity(e.target.value)} className="input-field w-full" placeholder="San Francisco, CA" />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => setStep(1)} className="btn-secondary flex-1">← Back</button>
            <button onClick={handleCreateConference} disabled={saving || !confName} className="btn-primary flex-1">
              {saving ? 'Creating…' : 'Continue →'}
            </button>
          </div>
          <button onClick={() => setStep(3)} className="w-full text-center text-sm text-gray-400 hover:text-gray-600 mt-3">
            Skip this step
          </button>
        </div>
      )}

      {/* Step 3: ICP setup */}
      {step === 3 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 font-serif mb-1">Define your ideal customer</h2>
          <p className="text-sm text-gray-500 mb-5">This helps Parlay score and rank companies at your events.</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target company type</label>
              <input type="text" value={companyType} onChange={e => setCompanyType(e.target.value)} className="input-field w-full" placeholder="e.g. Enterprise SaaS, Hospitality Group" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">What unit do you sell by?</label>
              <input type="text" value={unitType} onChange={e => setUnitType(e.target.value)} className="input-field w-full" placeholder="e.g. Seats, Rooms, Licenses" />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => setStep(2)} className="btn-secondary flex-1">← Back</button>
            <button onClick={handleSaveIcp} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving…' : 'Continue →'}
            </button>
          </div>
          <button onClick={() => setStep(4)} className="w-full text-center text-sm text-gray-400 hover:text-gray-600 mt-3">
            Skip this step
          </button>
        </div>
      )}

      {/* Step 4: Import attendees */}
      {step === 4 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm text-center">
          <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 font-serif mb-1">Import attendees</h2>
          <p className="text-sm text-gray-500 mb-6">
            Upload your attendee list CSV to unlock ICP scoring, target recommendations, and pre-conference review.
            {createdConferenceId && ' You can do this from your conference page.'}
          </p>
          <div className="flex flex-col gap-3">
            {createdConferenceId && (
              <a
                href={`/conferences/${createdConferenceId}`}
                className="btn-primary w-full py-3 text-center"
                onClick={handleComplete}
              >
                Go to conference & upload attendees →
              </a>
            )}
            <button onClick={handleComplete} className={createdConferenceId ? 'btn-secondary w-full' : 'btn-primary w-full py-3'}>
              I&apos;ll do this later
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Complete */}
      {step === 5 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 font-serif mb-2">You&apos;re all set!</h2>
          <p className="text-sm text-gray-500 mb-6">Your account is ready. Here&apos;s where to go next.</p>
          <div className="flex flex-col gap-3">
            {createdConferenceId && (
              <a href={`/conferences/${createdConferenceId}`} className="btn-primary w-full py-3 text-center">
                Open Pre-Conference Review →
              </a>
            )}
            <a href="/" className="btn-secondary w-full text-center">
              Go to Dashboard
            </a>
          </div>
        </div>
      )}
    </OnboardingLayout>
  );
}
