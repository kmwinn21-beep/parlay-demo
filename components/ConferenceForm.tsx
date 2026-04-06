'use client';

import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useConfigOptions } from '@/lib/useConfigOptions';

interface ConferenceFormData {
  name: string;
  start_date: string;
  end_date: string;
  location: string;
  notes: string;
}

export function ConferenceForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedInternalAttendees, setSelectedInternalAttendees] = useState<string[]>([]);
  const [internalDropdownOpen, setInternalDropdownOpen] = useState(false);
  const internalDropdownRef = useRef<HTMLDivElement>(null);
  const configOptions = useConfigOptions();
  const userOptions = configOptions.user ?? [];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (internalDropdownRef.current && !internalDropdownRef.current.contains(e.target as Node)) {
        setInternalDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConferenceFormData>();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      const ext = f.name.toLowerCase().split('.').pop();
      if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
        toast.error('Please upload an Excel (.xlsx, .xls) or CSV file.');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      setFile(f);
    }
  };

  const onSubmit = async (data: ConferenceFormData) => {
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('name', data.name);
      formData.append('start_date', data.start_date);
      formData.append('end_date', data.end_date);
      formData.append('location', data.location);
      formData.append('notes', data.notes || '');
      formData.append('internal_attendees', selectedInternalAttendees.join(','));

      if (file) {
        formData.append('file', file);
      }

      const res = await fetch('/api/conferences', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Failed to create conference');
      }

      toast.success(
        `Conference created! ${result.parsed_count > 0 ? `${result.parsed_count} attendees imported.` : ''}`
      );
      router.push(`/conferences/${result.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create conference');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Basic Info */}
      <div className="card">
        <h2 className="text-lg font-semibold text-procare-dark-blue mb-5 font-serif">Conference Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2">
            <label className="label">Conference Name *</label>
            <input
              {...register('name', { required: 'Conference name is required' })}
              className="input-field"
              placeholder="e.g., Argentum Senior Living Conference 2025"
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="label">Start Date *</label>
            <input
              type="date"
              {...register('start_date', { required: 'Start date is required' })}
              className="input-field"
            />
            {errors.start_date && <p className="text-red-500 text-xs mt-1">{errors.start_date.message}</p>}
          </div>

          <div>
            <label className="label">End Date *</label>
            <input
              type="date"
              {...register('end_date', { required: 'End date is required' })}
              className="input-field"
            />
            {errors.end_date && <p className="text-red-500 text-xs mt-1">{errors.end_date.message}</p>}
          </div>

          <div className="md:col-span-2">
            <label className="label">Location *</label>
            <input
              {...register('location', { required: 'Location is required' })}
              className="input-field"
              placeholder="e.g., Las Vegas Convention Center, NV"
            />
            {errors.location && <p className="text-red-500 text-xs mt-1">{errors.location.message}</p>}
          </div>

          <div className="md:col-span-2">
            <label className="label">Notes</label>
            <textarea
              {...register('notes')}
              className="input-field resize-none"
              rows={3}
              placeholder="Any additional notes about this conference..."
            />
          </div>

          <div className="md:col-span-2" ref={internalDropdownRef}>
            <label className="label">Internal Attendees</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setInternalDropdownOpen(!internalDropdownOpen)}
                className="input-field w-full text-left flex items-center justify-between"
              >
                <span className={selectedInternalAttendees.length === 0 ? 'text-gray-400' : 'text-gray-800'}>
                  {selectedInternalAttendees.length === 0
                    ? 'Select internal attendees...'
                    : `${selectedInternalAttendees.length} selected`}
                </span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${internalDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {internalDropdownOpen && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {userOptions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500">No users configured. Add users in the Admin panel.</div>
                  ) : (
                    userOptions.map((user) => {
                      const isSelected = selectedInternalAttendees.includes(user);
                      return (
                        <button
                          key={user}
                          type="button"
                          onClick={() => {
                            setSelectedInternalAttendees((prev) =>
                              isSelected ? prev.filter((u) => u !== user) : [...prev, user]
                            );
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                          <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${isSelected ? 'bg-procare-bright-blue border-procare-bright-blue' : 'border-gray-300'}`}>
                            {isSelected && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </span>
                          {user}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
            {selectedInternalAttendees.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedInternalAttendees.map((user) => (
                  <span
                    key={user}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-procare-bright-blue border border-blue-200"
                  >
                    {user}
                    <button
                      type="button"
                      onClick={() => setSelectedInternalAttendees((prev) => prev.filter((u) => u !== user))}
                      className="hover:text-red-500"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* File Upload */}
      <div className="card">
        <h2 className="text-lg font-semibold text-procare-dark-blue mb-2 font-serif">Import Attendees</h2>
        <p className="text-sm text-gray-500 mb-4">
          Upload an Excel (.xlsx, .xls) or CSV file with attendee data. The system will auto-detect columns for name, title, company, email, website, company type, assigned user, and WSE (worksite employee count).
        </p>

        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            file ? 'border-procare-bright-blue bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) {
              const ext = f.name.toLowerCase().split('.').pop();
              if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
                toast.error('Please upload an Excel or CSV file.');
                return;
              }
              setFile(f);
            }
          }}
        >
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <svg className="w-8 h-8 text-procare-bright-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-left">
                <p className="text-sm font-medium text-procare-dark-blue">{file.name}</p>
                <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <button
                type="button"
                onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                className="ml-2 text-red-400 hover:text-red-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <svg className="w-10 h-10 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm text-gray-600">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-procare-bright-blue hover:underline font-medium"
                >
                  Click to upload
                </button>
                {' '}or drag and drop
              </p>
              <p className="text-xs text-gray-400 mt-1">Excel (.xlsx, .xls) or CSV files</p>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Submit */}
      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={() => router.push('/conferences')}
          className="btn-secondary"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary flex items-center gap-2"
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Creating...
            </>
          ) : (
            'Create Conference'
          )}
        </button>
      </div>
    </form>
  );
}
