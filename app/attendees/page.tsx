'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { AttendeeTable } from '@/components/AttendeeTable';
import { BackButton } from '@/components/BackButton';
import { useForm } from 'react-hook-form';

interface Attendee {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
  company_name?: string;
  company_type?: string;
  email?: string;
  notes?: string;
  status?: string;
  action?: string;
  next_steps?: string;
  next_steps_notes?: string;
  conference_count: number;
  conference_names?: string;
}

interface Company {
  id: number;
  name: string;
}

interface ConferenceOption {
  id: number;
  name: string;
}

interface AddAttendeeForm {
  first_name: string;
  last_name: string;
  title: string;
  company_id: string;
  email: string;
  conference_id: string;
}

export default function AttendeesPage() {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [conferences, setConferences] = useState<ConferenceOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<AddAttendeeForm>();

  const fetchData = useCallback(async () => {
    try {
      const [atRes, coRes, confRes] = await Promise.all([
        fetch('/api/attendees'),
        fetch('/api/companies'),
        fetch('/api/conferences'),
      ]);
      const [atData, coData, confData] = await Promise.all([atRes.json(), coRes.json(), confRes.json()]);
      setAttendees(atData);
      setCompanies(coData);
      setConferences(Array.isArray(confData) ? confData.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })) : []);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Re-fetch when the user navigates back to this tab/page so notes_count stays fresh
  useEffect(() => {
    const onFocus = () => fetchData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchData]);

  const onSubmit = async (data: AddAttendeeForm) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/attendees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: data.first_name,
          last_name: data.last_name,
          title: data.title,
          email: data.email,
          company_id: data.company_id ? parseInt(data.company_id) : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create');
      }
      await res.json();
      // If a conference was selected, associate the attendee with it
      if (data.conference_id) {
        await fetch(`/api/conferences/${data.conference_id}/attendees/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: data.first_name,
            last_name: data.last_name,
            title: data.title || '',
            company: '',
            email: data.email || '',
          }),
        });
      }
      toast.success('Attendee added!');
      reset();
      setShowAddForm(false);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add attendee');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="h-8 w-20 bg-gray-200 rounded animate-pulse" />
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-40 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-56 bg-gray-100 rounded animate-pulse" />
          </div>
          <div className="h-10 w-32 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        <div className="card">
          <div className="flex gap-3 mb-4">
            <div className="flex-1 h-10 bg-gray-100 rounded animate-pulse" />
            <div className="h-10 w-28 bg-gray-100 rounded animate-pulse" />
            <div className="h-10 w-28 bg-gray-100 rounded animate-pulse" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-4 items-center">
                <div className="h-4 w-4 bg-gray-100 rounded animate-pulse" />
                <div className="h-4 flex-1 bg-gray-100 rounded animate-pulse" />
                <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
                <div className="h-4 w-28 bg-gray-100 rounded animate-pulse" />
                <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
                <div className="h-6 w-8 bg-gray-100 rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <BackButton />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-procare-dark-blue font-serif">Attendees</h1>
          <p className="text-sm text-gray-500">{attendees.length} contact{attendees.length !== 1 ? 's' : ''} in your database</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="btn-primary flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Add Attendee
        </button>
      </div>

      {/* Add Attendee Form */}
      {showAddForm && (
        <div className="card border-2 border-procare-bright-blue">
          <h2 className="text-lg font-semibold text-procare-dark-blue mb-4 font-serif">Add Attendee</h2>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">First Name *</label>
                <input
                  {...register('first_name', { required: 'Required' })}
                  className="input-field"
                  placeholder="First name"
                />
                {errors.first_name && <p className="text-red-500 text-xs mt-1">{errors.first_name.message}</p>}
              </div>
              <div>
                <label className="label">Last Name *</label>
                <input
                  {...register('last_name', { required: 'Required' })}
                  className="input-field"
                  placeholder="Last name"
                />
                {errors.last_name && <p className="text-red-500 text-xs mt-1">{errors.last_name.message}</p>}
              </div>
              <div>
                <label className="label">Title</label>
                <input {...register('title')} className="input-field" placeholder="Job title" />
              </div>
              <div>
                <label className="label">Company</label>
                <select {...register('company_id')} className="input-field">
                  <option value="">No company</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  {...register('email')}
                  className="input-field"
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="label">Conference *</label>
                <select {...register('conference_id', { required: 'Please select a conference' })} className="input-field">
                  <option value="">Select a conference...</option>
                  {conferences.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {errors.conference_id && <p className="text-red-500 text-xs mt-1">{errors.conference_id.message}</p>}
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button type="submit" disabled={isSubmitting} className="btn-primary">
                {isSubmitting ? 'Adding...' : 'Add Attendee'}
              </button>
              <button
                type="button"
                onClick={() => { setShowAddForm(false); reset(); }}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Attendees Table */}
      <div className="card">
        <AttendeeTable attendees={attendees} onRefresh={fetchData} />
      </div>
    </div>
  );
}
