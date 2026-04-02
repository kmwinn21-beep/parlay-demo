'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { AttendeeTable } from '@/components/AttendeeTable';
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
  conference_count: number;
  conference_names?: string;
}

interface Company {
  id: number;
  name: string;
}

interface AddAttendeeForm {
  first_name: string;
  last_name: string;
  title: string;
  company_id: string;
  email: string;
  notes: string;
}

export default function AttendeesPage() {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<AddAttendeeForm>();

  const fetchData = useCallback(async () => {
    try {
      const [atRes, coRes] = await Promise.all([
        fetch('/api/attendees'),
        fetch('/api/companies'),
      ]);
      const [atData, coData] = await Promise.all([atRes.json(), coRes.json()]);
      setAttendees(atData);
      setCompanies(coData);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onSubmit = async (data: AddAttendeeForm) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/attendees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          company_id: data.company_id ? parseInt(data.company_id) : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create');
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-procare-bright-blue border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
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
          <h2 className="text-lg font-semibold text-procare-dark-blue mb-4 font-serif">Add New Attendee</h2>
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
                <label className="label">Notes</label>
                <input {...register('notes')} className="input-field" placeholder="Any notes..." />
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
