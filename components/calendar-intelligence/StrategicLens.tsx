'use client';

import { useState, useEffect, useCallback } from 'react';

interface ComponentScores {
  audienceFit: number | null;
  targetOpportunity: number | null;
  engagementCapture: number | null;
  commercialPotential: number | null;
  costJustification: number | null;
  strategicValue: number | null;
}

type WeightKey = keyof ComponentScores;

interface LensWeights {
  audienceFit: number;
  targetOpportunity: number;
  engagementCapture: number;
  commercialPotential: number;
  costJustification: number;
  strategicValue: number;
}

interface SavedLens {
  id: number;
  name: string;
  weights: LensWeights;
  isPersonalDefault: boolean;
  isAccountDefault: boolean;
  createdByUserId: number | null;
}

interface Props {
  score: {
    calendarRecommendationScore: number | null;
    componentScores?: ComponentScores;
  };
  conferenceId: number;
}

const COMPONENT_LABELS: Record<WeightKey, string> = {
  audienceFit:         'Audience Fit',
  targetOpportunity:   'Target Opportunity',
  engagementCapture:   'Engagement Capture',
  commercialPotential: 'Commercial Potential',
  costJustification:   'Cost Justification',
  strategicValue:      'Strategic Value',
};

const LENS_PRESETS: Record<string, { label: string; weights: LensWeights }> = {
  parlay_default:     { label: 'Parlay Default',     weights: { audienceFit: 25, targetOpportunity: 20, engagementCapture: 15, commercialPotential: 15, costJustification: 15, strategicValue: 10 } },
  pipeline_focused:   { label: 'Pipeline Focused',   weights: { audienceFit: 15, targetOpportunity: 30, engagementCapture: 10, commercialPotential: 25, costJustification: 10, strategicValue: 10 } },
  relationship_heavy: { label: 'Relationship Heavy', weights: { audienceFit: 20, targetOpportunity: 15, engagementCapture: 30, commercialPotential: 10, costJustification: 10, strategicValue: 15 } },
  cost_conscious:     { label: 'Cost Conscious',     weights: { audienceFit: 20, targetOpportunity: 20, engagementCapture: 15, commercialPotential: 10, costJustification: 30, strategicValue: 5 } },
};

const DEFAULT_WEIGHTS = LENS_PRESETS.parlay_default.weights;

// Weighted average: sum(score_k * weight_k) / sum(weight_k) for all non-null components.
function computeLensScore(componentScores: ComponentScores, weights: LensWeights): number | null {
  const keys = Object.keys(weights) as WeightKey[];
  const available = keys.filter(k => componentScores[k] != null);
  if (available.length === 0) return null;
  const totalWeight = available.reduce((s, k) => s + weights[k], 0);
  if (totalWeight === 0) return null;
  const weightedSum = available.reduce((s, k) => s + (componentScores[k]! * weights[k]), 0);
  return Math.round(weightedSum / totalWeight);
}

export function StrategicLens({ score, conferenceId: _conferenceId }: Props) {
  const [selectedPreset, setSelectedPreset] = useState<string>('parlay_default');
  const [weights, setWeights] = useState<LensWeights>({ ...DEFAULT_WEIGHTS });
  const [savedLenses, setSavedLenses] = useState<SavedLens[]>([]);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/calendar-intelligence/lenses')
      .then(r => r.ok ? r.json() : null)
      .then((data: { lenses: SavedLens[] } | null) => {
        if (data?.lenses) setSavedLenses(data.lenses);
      })
      .catch(() => {});
  }, []);

  const applyPreset = useCallback((key: string) => {
    setSelectedPreset(key);
    if (LENS_PRESETS[key]) {
      setWeights({ ...LENS_PRESETS[key].weights });
    } else {
      const saved = savedLenses.find(l => String(l.id) === key);
      if (saved) setWeights({ ...saved.weights });
    }
  }, [savedLenses]);

  const cs = score.componentScores ?? { audienceFit: null, targetOpportunity: null, engagementCapture: null, commercialPotential: null, costJustification: null, strategicValue: null };
  const defaultScore = computeLensScore(cs, DEFAULT_WEIGHTS);
  const lensScore = computeLensScore(cs, weights);
  const delta = lensScore != null && defaultScore != null ? lensScore - defaultScore : null;

  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const totalValid = Math.round(total) === 100;

  const handleWeightChange = (key: WeightKey, value: number) => {
    setWeights(w => ({ ...w, [key]: value }));
    setSelectedPreset('custom');
  };

  const handleSave = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/calendar-intelligence/lenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: saveName.trim(), weights }),
      });
      const data = await res.json() as { id?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      const listRes = await fetch('/api/calendar-intelligence/lenses');
      const listData = await listRes.json() as { lenses: SavedLens[] };
      setSavedLenses(listData.lenses ?? []);
      setSaveName('');
      setSelectedPreset(String(data.id));
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (lensId: number) => {
    await fetch(`/api/calendar-intelligence/lenses/${lensId}/set-default`, { method: 'PUT' });
    setSavedLenses(prev => prev.map(l => ({ ...l, isPersonalDefault: l.id === lensId })));
  };

  function renderDelta() {
    if (delta == null) return null;
    if (delta === 0) return <span className="text-xs text-gray-400">= Parlay default</span>;
    return (
      <span className={`text-xs font-semibold ${delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
        {delta > 0 ? '↑' : '↓'} {Math.abs(delta)} vs Parlay default
      </span>
    );
  }

  return (
    <div className="p-5 space-y-5">
      {/* Preset selector */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">Preset Lens</p>
        <select
          className="input-field text-sm w-full"
          value={selectedPreset}
          onChange={(e) => applyPreset(e.target.value)}
        >
          {Object.entries(LENS_PRESETS).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
          {savedLenses.length > 0 && (
            <optgroup label="Saved Lenses">
              {savedLenses.map(l => (
                <option key={l.id} value={String(l.id)}>
                  {l.name}{l.isPersonalDefault ? ' ★' : ''}
                </option>
              ))}
            </optgroup>
          )}
          {selectedPreset === 'custom' && <option value="custom">Custom</option>}
        </select>
      </div>

      {/* Lens score */}
      <div className={`rounded-lg p-3 border ${totalValid ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lens Score</p>
            {renderDelta()}
          </div>
          <span className="text-3xl font-bold text-gray-900">{lensScore ?? '—'}</span>
        </div>
        {!totalValid && (
          <p className="text-xs text-amber-700 mt-2 font-medium">
            Weights total {Math.round(total)}% — adjust to 100% to save or get an accurate score.
          </p>
        )}
      </div>

      {/* Weight sliders */}
      <div className="space-y-3">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Adjust Weights</p>
        {(Object.keys(weights) as WeightKey[]).map(key => {
          const componentScore = cs[key];
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-gray-700">{COMPONENT_LABELS[key]}</label>
                <div className="flex items-center gap-2">
                  {componentScore != null && <span className="text-xs text-gray-400">{Math.round(componentScore)}/100</span>}
                  <span className="text-sm font-semibold text-gray-900 w-8 text-right">{weights[key]}%</span>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={weights[key]}
                onChange={(e) => handleWeightChange(key, Number(e.target.value))}
                className="w-full accent-brand-secondary"
              />
            </div>
          );
        })}
        <div className="flex items-center justify-between text-xs pt-1 border-t">
          <span className="text-gray-500">Total weight</span>
          <span className={`font-bold ${totalValid ? 'text-emerald-600' : 'text-red-600'}`}>{Math.round(total)}%</span>
        </div>
      </div>

      {/* Save lens */}
      <div className="pt-3 border-t space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Save as Custom Lens</p>
        {!totalValid && (
          <p className="text-xs text-gray-400">Adjust weights to exactly 100% to enable saving.</p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Lens name…"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            disabled={!totalValid}
            className="input-field text-sm flex-1 disabled:opacity-40"
          />
          <button
            onClick={handleSave}
            disabled={saving || !saveName.trim() || !totalValid}
            className="btn-primary text-sm px-3 disabled:opacity-50"
          >
            {saving ? '…' : 'Save'}
          </button>
        </div>
        {saveError && <p className="text-xs text-red-600">{saveError}</p>}
      </div>

      {/* Saved lenses list with set-default */}
      {savedLenses.length > 0 && (
        <div className="pt-3 border-t space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Saved Lenses</p>
          {savedLenses.map(l => (
            <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-gray-700">{l.name}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleSetDefault(l.id)}
                  title="Set as my default"
                  className={`p-1 rounded transition-colors ${l.isPersonalDefault ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}
                >
                  ★
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
