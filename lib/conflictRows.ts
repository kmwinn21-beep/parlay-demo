/**
 * Which column a conflict row's answer points at, and what that answer does.
 *
 * The upload review modal asks two different questions through one layout.
 *
 *   A FIELD row asks which of two values to keep. The columns hold two
 *   candidate values, and accepting means taking the proposed one.
 *
 *   An IDENTITY row asks whether a name in the file is an existing company.
 *   The columns hold an existing record and an action, and answering YES means
 *   using the EXISTING one — the left column — while answering no performs the
 *   action written on the right.
 *
 * So `accept` does not always point at the same column, and a modal that
 * assumed it did highlighted whichever option the reader had NOT chosen: press
 * "Same company" and the row bolded `Add "X" as a new company`, which is what
 * pressing the other button would have done.
 *
 * The rule lives here rather than inside the component because it is the part
 * worth being sure about, and a rule buried in JSX can only be checked by
 * reading it.
 */

export type ConflictColumn = 'current' | 'proposed';
export type ConflictAnswer = 'accept' | 'ignore';

/** The parts of a conflict row that decide how an answer is displayed. */
export interface ConflictRowDisplay {
  acceptShows?: ConflictColumn;
  acceptCaption?: string;
  ignoreCaption?: string;
}

/**
 * Said when a row does not say it for itself. These read correctly only for a
 * row whose two columns are two candidate values; a row whose columns are a
 * record and an action supplies its own, naming what the action does.
 */
export const DEFAULT_ACCEPT_CAPTION = '← using this';
export const DEFAULT_IGNORE_CAPTION = '← keeping';

/** The column `accept` points at. Proposed unless the row says otherwise. */
export function acceptColumn(row: ConflictRowDisplay): ConflictColumn {
  return row.acceptShows ?? 'proposed';
}

/** The column a given answer points at — the one to highlight. */
export function columnFor(row: ConflictRowDisplay, answer: ConflictAnswer): ConflictColumn {
  const accepts = acceptColumn(row);
  if (answer === 'accept') return accepts;
  return accepts === 'current' ? 'proposed' : 'current';
}

/** Whether a column is the one the current answer chose. Unanswered: neither. */
export function isChosen(
  row: ConflictRowDisplay,
  answer: ConflictAnswer | null | undefined,
  column: ConflictColumn,
): boolean {
  if (answer == null) return false;
  return columnFor(row, answer) === column;
}

/**
 * What to say under a column, given that it is the chosen one.
 *
 * Keyed on the column rather than the answer so the caption cannot drift from
 * the highlight: whichever column an answer lights up gets that answer's words.
 */
export function captionFor(row: ConflictRowDisplay, column: ConflictColumn): string {
  return acceptColumn(row) === column
    ? (row.acceptCaption ?? DEFAULT_ACCEPT_CAPTION)
    : (row.ignoreCaption ?? DEFAULT_IGNORE_CAPTION);
}
