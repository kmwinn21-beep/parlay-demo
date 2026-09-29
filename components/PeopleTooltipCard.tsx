'use client';

/**
 * A list of people in a hover tooltip: who they are, and what they do.
 *
 * One bulleted line each, "Name · Title", because the two belong together —
 * a list of names alone leaves the reader working out which one is the
 * decision maker, which is usually why they hovered.
 *
 * Only the card. Where it goes is the caller's business, since the thing it
 * hangs off is a count pill in one place and a truncated table cell in
 * another; see lib/tooltipPosition.
 */
export interface TooltipPerson {
  name: string;
  title?: string | null;
}

export function PeopleTooltipCard({ heading, people }: {
  /** Said in small caps above the list — "Attendees", "Internal Attendees". */
  heading: string;
  people: TooltipPerson[];
}) {
  return (
    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-xl px-3 py-2.5">
      <p className="font-semibold mb-1.5 text-gray-300 uppercase tracking-wide text-[10px]">{heading}</p>
      <ul className="space-y-1">
        {people.map((p, i) => (
          <li key={i} className="flex items-start gap-1.5">
            {/* Aligned to the first line rather than centred: a title that
                wraps would otherwise float the dot into the middle of it. */}
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0 mt-1" />
            <span>
              <span className="font-medium">{p.name}</span>
              {p.title && <span className="text-gray-300"> · {p.title}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
