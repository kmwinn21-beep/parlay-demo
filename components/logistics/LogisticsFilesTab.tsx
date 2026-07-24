'use client';

import { type LogisticsFile, type PlanNote, type PlanNoteSection } from './types';
import { FileRow, FileUploadZone, EmptyState } from './shared';
import { PlanSectionNotes } from './PlanSectionNotes';

export function LogisticsFilesTab({ conferenceId, planYear, files, onChange, notes, onNoteCreated, onShowAllNotes }: {
  conferenceId: number;
  planYear: number;
  files: LogisticsFile[];
  onChange: (files: LogisticsFile[]) => void;
  notes: PlanNote[];
  onNoteCreated: (note: PlanNote) => void;
  onShowAllNotes: (section: PlanNoteSection) => void;
}) {
  return (
    <div className="space-y-4">
      <FileUploadZone conferenceId={conferenceId} planYear={planYear} onUploaded={f => onChange([f, ...files])} />
      {files.length === 0 ? (
        <EmptyState icon="ti-file" headline="No files uploaded yet" subtext="Upload exhibitor kits, contracts, and other documents" />
      ) : (
        <div>
          {files.map(f => <FileRow key={f.id} conferenceId={conferenceId} file={f} onDeleted={id => onChange(files.filter(x => x.id !== id))} />)}
        </div>
      )}
      <PlanSectionNotes conferenceId={conferenceId} planYear={planYear} section="files" notes={notes} onNoteCreated={onNoteCreated} onShowAll={onShowAllNotes} />
    </div>
  );
}
