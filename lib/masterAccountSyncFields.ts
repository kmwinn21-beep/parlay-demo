/**
 * The company fields a master account sync run can write, and how to label
 * them. The admin picks which ones a run touches before it goes anywhere, so
 * a sync can be narrowed to — say — just reps without dragging websites and
 * unit counts along with it.
 *
 * Not here on purpose: entity_structure, which is derived from a company's
 * parent/child links rather than anything a master sheet can assert.
 */
export const SYNC_FIELDS = [
  'website',
  'assigned_user',
  'hq_state',
  'territory_id',
  'services',
  'wse',
  'crm_link',
] as const;

export type SyncField = typeof SYNC_FIELDS[number];

/** `wse` is labelled with the account's own unit noun, so it takes a value. */
export function syncFieldLabel(field: SyncField, unitLabel: string): string {
  switch (field) {
    case 'website': return 'Website';
    case 'assigned_user': return 'Assigned Rep';
    case 'hq_state': return 'HQ State';
    case 'territory_id': return 'Territory';
    case 'services': return 'Services';
    case 'wse': return unitLabel;
    case 'crm_link': return 'CRM Link';
  }
}
