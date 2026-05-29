export interface ProcessingState {
  status: 'running' | 'done' | 'error';
  total: number;
  completed: number;
  error?: string;
  startedAt: number;
}

export const intelProcessingState = new Map<string, ProcessingState>();

export function stateKey(accountId: string, conferenceId: number) {
  return `${accountId}:${conferenceId}`;
}
