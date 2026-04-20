'use client';

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { CompanyTable } from '@/components/CompanyTable';
import { BackButton } from '@/components/BackButton';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import { useForm } from 'react-hook-form';
import { useConfigOptions } from '@/lib/useConfigOptions';
import { RepMultiSelect } from '@/components/RepMultiSelect';
import { useUserOptions, parseRepIds } from '@/lib/useUserOptions';

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
  services: string[];
  icp: string | null;
  notes: string;
  assigned_user: string;
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<AddCompanyForm>({
    defaultValues: { services: [], icp: null },
  });
  const configOptions = useConfigOptions('company_table');
  const companyTypeOptions = configOptions.company_type ?? [];
  const profitTypeOptions = configOptions.profit_type ?? [];
  const servicesOptions = configOptions.services ?? [];
  const icpOptions = (configOptions.icp ?? []).filter(v => v !== 'True' && v !== 'False');
  const userOptionsFull = useUserOptions();
  const selectedServices = watch('services') ?? [];
  const icp = watch('icp');

  useEffect(() => {
    register('services');
  }, [register]);

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
      reset({ services: [], icp: null });
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
                <div className="h-4 w-28 bg-gray-100 rounded animate-pulse" />
                <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
                <div className="h-6 w-8 bg-gray-100 rounded-full animate-pulse" />
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
          <h1 className="text-2xl font-bold text-brand-primary font-serif">Companies</h1>
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
        <div className="card border-2 border-brand-secondary">
          <h2 className="text-lg font-semibold text-brand-primary mb-4 font-serif">Add New Company</h2>
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
                <MultiSelectDropdown
                  label="Services"
                  options={servicesOptions}
                  values={selectedServices}
                  onChange={(values) => setValue('services', values)}
                  placeholder="Select services..."
                  emptyMessage="No services configured. Add options in the Admin panel."
                />
              </div>
              <div>
                <label className="label">ICP</label>
                <div className="inline-flex items-center rounded-lg border border-gray-200 p-1 bg-gray-50">
                  {icpOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setValue('icp', option)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${icp === option ? 'bg-brand-secondary text-white' : 'text-gray-600 hover:text-gray-800'}`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <input type="hidden" {...register('icp')} />
              </div>
              <div>
                <label className="label">Assigned User</label>
                <RepMultiSelect
                  options={userOptionsFull}
                  selectedIds={parseRepIds(watch('assigned_user'))}
                  onChange={(ids) => setValue('assigned_user', ids.join(','))}
                  triggerClass="input-field w-full flex items-center justify-between gap-2 text-sm"
                  placeholder="Select users..."
                />
                <input type="hidden" {...register('assigned_user')} />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button type="submit" disabled={isSubmitting} className="btn-primary">
                {isSubmitting ? 'Adding...' : 'Add Company'}
              </button>
              <button
                type="button"
                onClick={() => { setShowAddForm(false); reset({ services: [], icp: null }); }}
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
