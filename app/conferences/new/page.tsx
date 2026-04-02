import Link from 'next/link';
import { ConferenceForm } from '@/components/ConferenceForm';

export default function NewConferencePage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/conferences" className="hover:text-procare-bright-blue">Conferences</Link>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-gray-800">New Conference</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-procare-dark-blue font-serif">Add New Conference</h1>
        <p className="text-sm text-gray-500 mt-1">
          Fill in conference details and optionally upload an attendee list.
        </p>
      </div>

      <ConferenceForm />
    </div>
  );
}
