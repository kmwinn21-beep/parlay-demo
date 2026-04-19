'use client';

import { useState } from 'react';
import { useHideBottomNav } from './BottomNavContext';

interface OperatorCapitalItem {
  id: number;
  label: string;
  sublabel?: string;
}

interface OperatorCapitalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (companyIds: number[]) => Promise<void>;
  items: OperatorCapitalItem[];
}

export function OperatorCapitalModal({
  isOpen,
  onClose,
  onSubmit,
  items,
}: OperatorCapitalModalProps) {
  useHideBottomNav(isOpen);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const pairCount = (items.length * (items.length - 1)) / 2;

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      await onSubmit(items.map((i) => i.id));
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl border border-procare-gold max-w-md w-full mx-4 flex flex-col max-h-[90vh]">
        {/* Fixed header */}
        <div className="flex-shrink-0 p-6 pb-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">Create Operator / Capital Relationships</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="text-sm text-gray-600 mb-5">
            This will create operator/capital relationships between all {items.length} selected companies ({pairCount} relationship{pairCount !== 1 ? 's' : ''}). Each company will appear as a related company on the others&apos; detail pages.
          </p>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 min-h-0">
          <div className="space-y-2 mb-5">
            <p className="text-sm font-medium text-gray-700">Companies to be linked:</p>
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50"
              >
                <svg className="w-4 h-4 mt-0.5 text-procare-bright-blue flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-gray-800">{item.label}</p>
                  {item.sublabel && (
                    <p className="text-xs text-gray-500">{item.sublabel}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mb-5 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs text-blue-800">
              <strong>Note:</strong> Operator/Capital relationships are bidirectional. Each company will see the others listed in its &quot;Operator / Capital Relationships&quot; section. Duplicate relationships are automatically ignored.
            </p>
          </div>
        </div>

        {/* Fixed footer */}
        <div className="flex-shrink-0 p-6 pt-4">
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1" disabled={isLoading}>
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating...' : `Create ${pairCount} Relationship${pairCount !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
