'use client';

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { CompanyTable } from '@/components/CompanyTable';
import { BackButton } from '@/components/BackButton';
import { useForm } from 'react-hook-form';
import { useConfigOptions } from '@/lib/useConfigOptions';

interface Company {
  id: number;
  name: string;
  website?: string;
  profit_type?: string;
  company_type?: string;
  notes?: string;
  status?: string;
  attendee_count: number;
  conference_count: number;
}

interface AddCompanyForm {
  name: string;
  website: string;
  profit_type: string;
  company_type: string;
  notes: string;
  assigned_user: string;
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<AddCompanyForm>();
  const configOptions = useConfigOptions();
  const companyTypeOptions = configOptions.company_type ?? [];
  const profitTypeOptions = configOptions.profit_type ?? [];
  const userOptions = configOptions.user ?? [];

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await fetch('/api/companies');
      const data = await res.json();
      setCompanies(data);
    } catch {
      toast.error('Failed to load companies');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const onSubmit = async (data: AddCompanyForm) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create');
      }
      toast.success('Company added!');
      reset();
      setShowAddForm(false);
      fetchCompanies();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add company');
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
      <BackButton />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-procare-dark-blue font-serif">Companies</h1>
          <p className="text-sm text-gray-500">{companies.length} compan{companies.length !== 1 ? 'ies' : 'y'} in your database</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="btn-primary flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Add Company
        </button>
      </div>

      {/* Add Company Form */}
      {showAddForm && (
        <div className="card border-2 border-procare-bright-blue">
          <h2 className="text-lg font-semibold text-procare-dark-blue mb-4 font-serif">Add New Company</h2>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="label">Company Name *</label>
                <input
                  {...register('name', { required: 'Company name is required' })}
                  className="input-field"
                  placeholder="Company name"
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <label className="label">Website</label>
                <input
                  {...register('website')}
                  className="input-field"
                  placeholder="https://example.com"
                />
              </div>
              <div>
                <label className="label">Company Type</label>
                <select {...register('company_type')} className="input-field">
                  <option value="">Select type...</option>
                  {companyTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Profit Type</label>
                <select {...register('profit_type')} className="input-field">
                  <option value="">Select...</option>
                  {profitTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Notes</label>
                <input {...register('notes')} className="input-field" placeholder="Any notes..." />
              </div>
              <div>
                <label className="label">Assigned User</label>
                <select {...register('assigned_user')} className="input-field">
                  <option value="">Select user...</option>
                  {userOptions.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button type="submit" disabled={isSubmitting} className="btn-primary">
                {isSubmitting ? 'Adding...' : 'Add Company'}
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

      {/* Companies Table */}
      <div className="card">
        <CompanyTable companies={companies} onRefresh={fetchCompanies} />
      </div>
    </div>
  );
}
