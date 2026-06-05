import * as XLSX from 'xlsx';

const STANDARD_COLUMNS = [
  'Full Name', 'Job Title', 'Email Address', 'Company Name', 'Website',
  'Function', 'Assigned Rep', 'Services', 'Conference', 'Company Type', 'Units',
];

export function exportToXlsx(rows: Record<string, unknown>[]): Buffer {
  if (rows.length === 0) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([STANDARD_COLUMNS]);
    XLSX.utils.book_append_sheet(wb, ws, 'Attendees');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  // Determine column order: standard first, then any custom columns
  const customKeys = Object.keys(rows[0]).filter(k => !STANDARD_COLUMNS.includes(k));
  const allColumns = [...STANDARD_COLUMNS, ...customKeys];

  // Build 2D array
  const data: unknown[][] = [allColumns];
  for (const row of rows) {
    data.push(allColumns.map(col => row[col] ?? ''));
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Style header row (bold + light gray background via cell styles not supported by xlsx OSS)
  // Apply column widths: auto-sized, min 12, max 40
  const colWidths = allColumns.map(col => {
    let max = col.length;
    for (const row of rows) {
      const val = row[col];
      const len = val != null ? String(val).length : 0;
      if (len > max) max = len;
    }
    return { wch: Math.min(40, Math.max(12, max + 2)) };
  });
  ws['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, 'Attendees');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
