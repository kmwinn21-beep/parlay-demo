'use client';

import { useState } from 'react';
import { useHideBottomNav } from './BottomNavContext';

interface ParentChildItem {
  id: number;
  label: string;
  sublabel?: string;
}

interface ParentChildModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (parentId: number, childIds: number[]) => Promise<void>;
  items: ParentChildItem[];
}

export function ParentChildModal({
  isOpen,
  onClose,
  onSubmit,
  items,
}: ParentChildModalProps) {
  useHideBottomNav(isOpen);
  const [parentId, setParentId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!parentId) return;
    const childIds = items.map((i) => i.id).filter((id) => id !== parentId);
    setIsLoading(true);
    try {
      await onSubmit(parentId, childIds);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const childItems = parentId ? items.filter(i => i.id !== parentId) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 flex flex-col max-h-[90vh]">
        {/* Fixed header */}
        <div className="flex-shrink-0 p-6 pb-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">Create Parent/Child Relationship</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="text-sm text-gray-600 mb-5">
            Select the parent company. The remaining companies will become children. Their contacts and conferences will stay on the child record, while meetings, notes, and follow-ups will roll up to the parent.
          </p>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 min-h-0">
          <div className="space-y-3 mb-6">
            <p className="text-sm font-medium text-gray-700">Select the parent company:</p>
            {items.map((item) => (
              <label
                key={item.id}
                className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  parentId === item.id
                    ? 'border-procare-bright-blue bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="parent"
                  value={item.id}
                  checked={parentId === item.id}
                  onChange={() => setParentId(item.id)}
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

          {parentId && childItems.length > 0 && (
            <div className="mb-5 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs font-semibold text-blue-800 mb-1.5">Child companies (will be linked to parent):</p>
              <ul className="space-y-1">
                {childItems.map(item => (
                  <li key={item.id} className="text-xs text-blue-700 flex items-center gap-1.5">
                    <svg className="w-3 h-3 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {parentId && (
            <div className="mb-5 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-xs text-yellow-800">
                <strong>Note:</strong> Contacts and conferences will remain on the child company records. Only meetings, notes, and follow-ups from children will be visible on the parent record.
              </p>
            </div>
          )}
        </div>

        {/* Fixed footer */}
        <div className="flex-shrink-0 p-6 pt-4">
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1" disabled={isLoading}>
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!parentId || isLoading}
              className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating...' : 'Create Relationship'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
