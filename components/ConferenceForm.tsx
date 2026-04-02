'use client';

import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface ConferenceFormData {
  name: string;
  start_date: string;
  end_date: string;
  location: string;
  notes: string;
}

interface ManualAttendee {
  first_name: string;
  last_name: string;
  title: string;
  company: string;
  email: string;
}

export function ConferenceForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [manualAttendees, setManualAttendees] = useState<ManualAttendee[]>([]);
  const [showAddAttendee, setShowAddAttendee] = useState(false);
  const [newAttendee, setNewAttendee] = useState<ManualAttendee>({
    first_name: '',
    last_name: '',
    title: '',
    company: '',
    email: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const addManualAttendee = () => {
    if (!newAttendee.first_name || !newAttendee.last_name) {
      toast.error('First and last name are required.');
      return;
    }
    setManualAttendees((prev) => [...prev, { ...newAttendee }]);
    setNewAttendee({ first_name: '', last_name: '', title: '', company: '', email: '' });
    setShowAddAttendee(false);
  };

  const removeManualAttendee = (index: number) => {
    setManualAttendees((prev) => prev.filter((_, i) => i !== index));
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

      if (file) {
        formData.append('file', file);
      }

      if (manualAttendees.length > 0) {
        formData.append('manual_attendees', JSON.stringify(manualAttendees));
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
        </div>
      </div>

      {/* File Upload */}
      <div className="card">
        <h2 className="text-lg font-semibold text-procare-dark-blue mb-2 font-serif">Import Attendees</h2>
        <p className="text-sm text-gray-500 mb-4">
          Upload an Excel (.xlsx, .xls) or CSV file with attendee data. The system will auto-detect columns for name, title, company, and email.
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

      {/* Manual Attendees */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">Manual Attendees</h2>
            {manualAttendees.length > 0 && (
              <p className="text-xs text-gray-500">{manualAttendees.length} attendee{manualAttendees.length !== 1 ? 's' : ''} added</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowAddAttendee(true)}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Attendee
          </button>
        </div>

        {showAddAttendee && (
          <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-gray-50">
            <h3 className="text-sm font-medium text-gray-700 mb-3">New Attendee</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">First Name *</label>
                <input
                  value={newAttendee.first_name}
                  onChange={(e) => setNewAttendee((p) => ({ ...p, first_name: e.target.value }))}
                  className="input-field"
                  placeholder="First name"
                />
              </div>
              <div>
                <label className="label text-xs">Last Name *</label>
                <input
                  value={newAttendee.last_name}
                  onChange={(e) => setNewAttendee((p) => ({ ...p, last_name: e.target.value }))}
                  className="input-field"
                  placeholder="Last name"
                />
              </div>
              <div>
                <label className="label text-xs">Title</label>
                <input
                  value={newAttendee.title}
                  onChange={(e) => setNewAttendee((p) => ({ ...p, title: e.target.value }))}
                  className="input-field"
                  placeholder="Job title"
                />
              </div>
              <div>
                <label className="label text-xs">Company</label>
                <input
                  value={newAttendee.company}
                  onChange={(e) => setNewAttendee((p) => ({ ...p, company: e.target.value }))}
                  className="input-field"
                  placeholder="Company name"
                />
              </div>
              <div className="col-span-2">
                <label className="label text-xs">Email</label>
                <input
                  type="email"
                  value={newAttendee.email}
                  onChange={(e) => setNewAttendee((p) => ({ ...p, email: e.target.value }))}
                  className="input-field"
                  placeholder="email@example.com"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={addManualAttendee}
                className="btn-primary text-sm"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setShowAddAttendee(false)}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {manualAttendees.length > 0 ? (
          <div className="space-y-2">
            {manualAttendees.map((a, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {a.first_name} {a.last_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {[a.title, a.company].filter(Boolean).join(' · ')}
                    {a.email && ` · ${a.email}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeManualAttendee(i)}
                  className="text-red-400 hover:text-red-600 ml-3"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">
            No manual attendees added yet. Use the button above or upload a file.
          </p>
        )}
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
