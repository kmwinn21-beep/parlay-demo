'use client';

import { type LogisticsFile } from './types';
import { FileRow, FileUploadZone, EmptyState } from './shared';

export function LogisticsFilesTab({ conferenceId, planYear, files, onChange }: {
  conferenceId: number; planYear: number; files: LogisticsFile[]; onChange: (files: LogisticsFile[]) => void;
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
    </div>
  );
}
