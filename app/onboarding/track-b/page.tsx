'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';

const TOTAL_STEPS = 5;

export default function TrackBOnboarding() {
  const [step, setStep] = useState(1);

  // ICP form
  const [companyType, setCompanyType] = useState('');
  const [unitType, setUnitType] = useState('');

  // Conference quick-add
  const [conferences, setConferences] = useState([{ name: '', startDate: '' }]);

  // Effectiveness defaults
  const [avgDealSize, setAvgDealSize] = useState('');
  const [avgCostPerUnit, setAvgCostPerUnit] = useState('');

  const [saving, setSaving] = useState(false);

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
      setStep(3);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateConferences = async () => {
    setSaving(true);
    try {
      const valid = conferences.filter(c => c.name.trim());
      await Promise.all(
        valid.map(c =>
          fetch('/api/conferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: c.name, start_date: c.startDate }),
          }).catch(() => {})
        )
      );
      setStep(4);
    } catch {
      toast.error('Some conferences could not be saved. You can add them later.');
      setStep(4);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEffectiveness = async () => {
    setSaving(true);
    try {
      if (avgDealSize || avgCostPerUnit) {
        const updates: Record<string, string> = {};
        if (avgDealSize) updates['avg_annual_deal_size'] = avgDealSize;
        if (avgCostPerUnit) updates['avg_cost_per_unit'] = avgCostPerUnit;
        await fetch('/api/admin/effectiveness', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        }).catch(() => {});
      }
    } finally {
      setSaving(false);
    }
    // Mark onboarding complete
    await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'onboarding_completed', value: 'true' }),
    }).catch(() => {});
    setStep(5);
  };

  const addConferenceRow = () => {
    if (conferences.length < 5) setConferences(prev => [...prev, { name: '', startDate: '' }]);
  };

  const updateConference = (idx: number, field: 'name' | 'startDate', value: string) => {
    setConferences(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  return (
    <OnboardingLayout step={step} totalSteps={TOTAL_STEPS}>
      {/* Step 1: Welcome */}
      {step === 1 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-sm">
          <div className="w-16 h-16 bg-brand-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 font-serif mb-2">Welcome to Parlay!</h1>
          <p className="text-gray-500 mb-6">
            Let&apos;s help you evaluate your conference portfolio and build a winning strategy for the season.
          </p>
          <button onClick={() => setStep(2)} className="btn-primary w-full py-3">
            Let&apos;s Go →
          </button>
        </div>
      )}

      {/* Step 2: ICP setup */}
      {step === 2 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 font-serif mb-1">Define your ideal customer</h2>
          <p className="text-sm text-gray-500 mb-5">This powers ICP scoring across all your conferences.</p>
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
            <button onClick={() => setStep(1)} className="btn-secondary flex-1">← Back</button>
            <button onClick={handleSaveIcp} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving…' : 'Continue →'}
            </button>
          </div>
          <button onClick={() => setStep(3)} className="w-full text-center text-sm text-gray-400 hover:text-gray-600 mt-3">
            Skip this step
          </button>
        </div>
      )}

      {/* Step 3: Add conferences */}
      {step === 3 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 font-serif mb-1">Add your conferences</h2>
          <p className="text-sm text-gray-500 mb-5">Add 2-3 events you&apos;re attending this season to start building your portfolio.</p>
          <div className="space-y-3">
            {conferences.map((conf, idx) => (
              <div key={idx} className="grid grid-cols-5 gap-2">
                <input
                  type="text"
                  value={conf.name}
                  onChange={e => updateConference(idx, 'name', e.target.value)}
                  className="input-field col-span-3"
                  placeholder={`Conference ${idx + 1} name`}
                />
                <input
                  type="date"
                  value={conf.startDate}
                  onChange={e => updateConference(idx, 'startDate', e.target.value)}
                  className="input-field col-span-2"
                />
              </div>
            ))}
            {conferences.length < 5 && (
              <button onClick={addConferenceRow} type="button" className="text-sm text-brand-primary hover:underline">
                + Add another conference
              </button>
            )}
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => setStep(2)} className="btn-secondary flex-1">← Back</button>
            <button onClick={handleCreateConferences} disabled={saving || !conferences.some(c => c.name.trim())} className="btn-primary flex-1">
              {saving ? 'Saving…' : 'Continue →'}
            </button>
          </div>
          <button onClick={() => setStep(4)} className="w-full text-center text-sm text-gray-400 hover:text-gray-600 mt-3">
            Skip this step
          </button>
        </div>
      )}

      {/* Step 4: Effectiveness defaults */}
      {step === 4 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 font-serif mb-1">Revenue benchmarks</h2>
          <p className="text-sm text-gray-500 mb-5">These defaults power pipeline forecasting and conference ROI modeling.</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Average annual deal size ($)</label>
              <input type="number" value={avgDealSize} onChange={e => setAvgDealSize(e.target.value)} className="input-field w-full" placeholder="e.g. 25000" min={0} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Average cost per unit ($)</label>
              <input type="number" value={avgCostPerUnit} onChange={e => setAvgCostPerUnit(e.target.value)} className="input-field w-full" placeholder="e.g. 100" min={0} />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => setStep(3)} className="btn-secondary flex-1">← Back</button>
            <button onClick={handleSaveEffectiveness} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving…' : 'Finish setup →'}
            </button>
          </div>
          <button onClick={async () => {
            await fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'onboarding_completed', value: 'true' }) }).catch(() => {});
            setStep(5);
          }} className="w-full text-center text-sm text-gray-400 hover:text-gray-600 mt-3">
            Skip this step
          </button>
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
          <p className="text-sm text-gray-500 mb-6">Your account is configured. Start exploring your conference portfolio.</p>
          <div className="flex flex-col gap-3">
            <a href="/program-intelligence" className="btn-primary w-full py-3 text-center">
              View Program Intelligence →
            </a>
            <a href="/" className="btn-secondary w-full text-center">
              Go to Dashboard
            </a>
          </div>
        </div>
      )}
    </OnboardingLayout>
  );
}
