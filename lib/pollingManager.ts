'use client';

type PollEntry = {
  fn: () => void;
  fgIntervalMs: number;
  bgIntervalMs: number;
  timerId: ReturnType<typeof setInterval> | null;
};

const polls = new Map<string, PollEntry>();
let windowFocused = true;
let tabVisible = true;

function effectiveIntervalMs(entry: PollEntry): number {
  return tabVisible ? entry.fgIntervalMs : entry.bgIntervalMs;
}

function stopTimer(entry: PollEntry): void {
  if (entry.timerId !== null) {
    clearInterval(entry.timerId);
    entry.timerId = null;
  }
}

function startTimer(entry: PollEntry): void {
  stopTimer(entry);
  entry.timerId = setInterval(entry.fn, effectiveIntervalMs(entry));
}

function syncAllPolls(): void {
  polls.forEach(entry => {
    if (!windowFocused) stopTimer(entry);
    else startTimer(entry);
  });
}

if (typeof window !== 'undefined') {
  windowFocused = document.hasFocus();
  tabVisible = document.visibilityState === 'visible';

  window.addEventListener('focus', () => { windowFocused = true; syncAllPolls(); });
  window.addEventListener('blur',  () => { windowFocused = false; syncAllPolls(); });
  document.addEventListener('visibilitychange', () => {
    tabVisible = document.visibilityState === 'visible';
    if (windowFocused) syncAllPolls();
  });
}

export function startPolling(
  key: string,
  fn: () => void,
  fgIntervalMs: number,
  bgIntervalMs = 30_000,
): void {
  const existing = polls.get(key);
  if (existing) stopTimer(existing);

  const entry: PollEntry = { fn, fgIntervalMs, bgIntervalMs, timerId: null };
  polls.set(key, entry);
  if (windowFocused) startTimer(entry);
}

export function stopPolling(key: string): void {
  const entry = polls.get(key);
  if (entry) {
    stopTimer(entry);
    polls.delete(key);
  }
}
