'use client';

import { useState } from 'react';
import { useHideBottomNav } from './BottomNavContext';

interface MergeItem {
  id: number;
  label: string;
  sublabel?: string;
}

interface MergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMerge: (masterId: number, duplicateIds: number[]) => Promise<void>;
  items: MergeItem[];
  title: string;
  description: string;
}

export function MergeModal({
  isOpen,
  onClose,
  onMerge,
  items,
  title,
  description,
}: MergeModalProps) {
  useHideBottomNav(isOpen);
  const [masterId, setMasterId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleMerge = async () => {
    if (!masterId) return;
    const duplicateIds = items.map((i) => i.id).filter((id) => id !== masterId);
    setIsLoading(true);
    try {
      await onMerge(masterId, duplicateIds);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl border border-procare-gold max-w-md w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-5">{description}</p>

        <div className="space-y-3 mb-6">
          <p className="text-sm font-medium text-gray-700">Select the master record to keep:</p>
          {items.map((item) => (
            <label
              key={item.id}
              className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                masterId === item.id
                  ? 'border-procare-bright-blue bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="master"
                value={item.id}
                checked={masterId === item.id}
                onChange={() => setMasterId(item.id)}
                className="mt-0.5 accent-procare-bright-blue"
              />
              <div>
                <p className="text-sm font-medium text-gray-800">{item.label}</p>
                {item.sublabel && (
                  <p className="text-xs text-gray-500">{item.sublabel}</p>
                )}
              </div>
            </label>
          ))}
        </div>

        {masterId && (
          <div className="mb-5 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <p className="text-xs text-yellow-800">
              <strong>Warning:</strong> The non-selected records will be deleted. All associated data (conferences, attendees) will be moved to the master record.
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="btn-secondary flex-1"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            onClick={handleMerge}
            disabled={!masterId || isLoading}
            className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Merging...' : 'Merge Records'}
          </button>
        </div>
      </div>
    </div>
  );
}
