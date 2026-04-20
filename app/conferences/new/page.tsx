import { ConferenceForm } from '@/components/ConferenceForm';
import { BackButton } from '@/components/BackButton';

export default function NewConferencePage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <BackButton />
      </div>

      <div>
        <h1 className="text-2xl font-bold text-brand-primary font-serif">Add New Conference</h1>
        <p className="text-sm text-gray-500 mt-1">
          Fill in conference details and optionally upload an attendee list.
        </p>
      </div>

      <ConferenceForm />
    </div>
  );
}
