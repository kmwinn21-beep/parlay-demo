'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import type { SwitchPrompt } from '@/lib/vendorSwitchServer';
import type { SwitchAnswer } from '@/lib/vendorSwitch';

export type { SwitchPrompt };

/**
 * The one question this workflow asks, wherever the save came from.
 *
 * Three forms can move a relationship's status — the update form, the add form
 * and the edit form — and all three hand their answer to this. Every rule in
 * this codebase that has lived in three places has drifted; here drifting would
 * mean one entry path quietly recording no switches at all.
 *
 * Asked AFTER the save, never before. The relationship the rep came to record
 * is already written and is not held hostage to an answer about a different
 * one — closing this without answering loses the switch, which is a smaller
 * loss than losing the edit.
 */
export function VendorSwitchPrompt({ prompt, onDone }: {
  prompt: SwitchPrompt;
  /** Called whether they answered or dismissed. */
  onDone: (recorded: boolean) => void;
}) {
  return prompt.kind === 'arrival'
    ? <ArrivalPrompt prompt={prompt} onDone={onDone} />
    : <DeparturePrompt prompt={prompt} onDone={onDone} />;
}

function Shell({ title, subtitle, onClose, children }: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{title}</p>
          <p className="text-sm text-gray-700 mt-1">{subtitle}</p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-5 space-y-3">{children}</div>
      </div>
    </div>
  );
}

async function record(body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch('/api/vendor-relationships/switch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    toast.error(data.error || 'Could not record that.');
    return false;
  }
  if (data.incomingName && body.answer === 'replacing') {
    toast.success(
      data.createdRelationshipId
        ? `Recorded — ${data.incomingName} added as a current vendor.`
        : `Recorded — now with ${data.incomingName}.`,
    );
  } else {
    toast.success('Recorded.');
  }
  return true;
}

/**
 * A competitor became current while another already was.
 *
 * Three answers, not two. "Keeping" is a real state — an account deliberately
 * running two vendors is its own competitive picture — and "unknown" is a
 * better record than a guess, because it says the question was asked.
 */
function ArrivalPrompt({ prompt, onDone }: {
  prompt: Extract<SwitchPrompt, { kind: 'arrival' }>;
  onDone: (recorded: boolean) => void;
}) {
  // Several incumbents is a real answer and this does not pick one: on a
  // multi-vendor account choosing for the rep would be wrong more often than
  // right. One is preselected only when it is the only one.
  const [chosen, setChosen] = useState<number[]>(
    prompt.incumbents.length === 1 ? [prompt.incumbents[0].id] : [],
  );
  const [markCompetitor, setMarkCompetitor] = useState(!prompt.incomingIsCompetitor);
  const [saving, setSaving] = useState(false);

  const answer = async (a: SwitchAnswer) => {
    const targets = a === 'replacing'
      ? prompt.incumbents.filter(i => chosen.includes(i.id))
      : prompt.incumbents;
    if (a === 'replacing' && targets.length === 0) {
      toast.error('Pick who they are replacing.');
      return;
    }
    setSaving(true);
    try {
      let ok = true;
      // One record per pair. Two incumbents replaced at once is two facts, and
      // collapsing them would leave the grid unable to draw either line.
      for (const t of targets) {
        ok = await record({
          account_id: prompt.accountId,
          incumbent_company_id: t.id,
          incumbent_relationship_id: t.relationshipId,
          incoming_company_id: prompt.incoming.id,
          incoming_relationship_id: prompt.relationshipId,
          answer: a,
          mark_competitor: a === 'replacing' && markCompetitor,
        }) && ok;
      }
      onDone(ok);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell
      title="Replacing a vendor?"
      subtitle={`${prompt.accountName} is now with ${prompt.incoming.name}.`}
      onClose={() => onDone(false)}
    >
      {/* Naming the status it matched on. "Is recorded as a current vendor
          here" is a claim about a row the rep is not looking at, and when it
          disagrees with the record behind this prompt there is no way to tell
          which of the two is wrong without seeing it. */}
      <p className="text-xs text-gray-500">
        {prompt.incumbents.length === 1
          ? `${prompt.incumbents[0].name} is recorded here as ${prompt.incumbents[0].statuses.join(', ') || 'a current vendor'}.`
          : 'These competitors are recorded here as current vendors.'}
      </p>

      <div className="space-y-1.5">
        {prompt.incumbents.map(i => {
          const on = chosen.includes(i.id);
          return (
            <button
              key={i.id}
              type="button"
              onClick={() => setChosen(p => (on ? p.filter(x => x !== i.id) : [...p, i.id]))}
              aria-pressed={on}
              className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all ${
                on ? 'border-brand-secondary bg-brand-secondary/5 text-brand-primary'
                  : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="block text-sm font-medium">{i.name}</span>
              {i.statuses.length > 0 && (
                <span className="block text-[11px] text-gray-400 mt-0.5">{i.statuses.join(', ')}</span>
              )}
            </button>
          );
        })}
      </div>

      {!prompt.incomingIsCompetitor && (
        <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={markCompetitor}
            onChange={e => setMarkCompetitor(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300"
          />
          {/* Ticked by default, never silent: company type drives more than
              this view, and retyping a company as a side effect of a
              relationship edit is a wide change from a narrow action. */}
          <span>
            Also mark <span className="font-semibold">{prompt.incoming.name}</span> as a
            Competitor, so this shows on the competitive map.
          </span>
        </label>
      )}

      <div className="space-y-2 pt-1">
        <button
          type="button"
          disabled={saving}
          onClick={() => answer('replacing')}
          className="w-full rounded-lg bg-brand-secondary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          Replacing them
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => answer('keeping')}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Keeping both
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => answer('unknown')}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Don&apos;t know
          </button>
        </div>
      </div>
    </Shell>
  );
}

interface PickerOption { id: number; name: string }

/**
 * A competitor's relationship went from current to former. Who replaced them?
 *
 * Skippable on purpose. Sometimes nobody did — in-house, consolidated, shut
 * down — and a required dropdown collects whatever was at the top of the list.
 * Bad data entered under pressure is worse than no data.
 */
function DeparturePrompt({ prompt, onDone }: {
  prompt: Extract<SwitchPrompt, { kind: 'departure' }>;
  onDone: (recorded: boolean) => void;
}) {
  const [q, setQ] = useState('');
  const [competitors, setCompetitors] = useState<PickerOption[]>([]);
  const [others, setOthers] = useState<PickerOption[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [picked, setPicked] = useState<PickerOption | null>(null);
  const [vendorType, setVendorType] = useState<string[]>(prompt.vendorType);
  const [markCompetitor, setMarkCompetitor] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback((query: string) => {
    const params = new URLSearchParams({
      account_id: String(prompt.accountId),
      exclude: String(prompt.outgoing.id),
    });
    if (query) params.set('q', query);
    fetch(`/api/vendor-relationships/switch?${params}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { competitors?: PickerOption[]; others?: PickerOption[]; othersTruncated?: boolean } | null) => {
        if (!d) return;
        setCompetitors(d.competitors ?? []);
        setOthers(d.others ?? []);
        setTruncated(d.othersTruncated === true);
      })
      .catch(() => {});
  }, [prompt.accountId, prompt.outgoing.id]);

  useEffect(() => {
    // Debounced, because this searches the whole book rather than the
    // conference — the list the rep needs is often not at this show.
    const t = setTimeout(() => load(q.trim()), q.trim() ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, load]);

  // Whether the chosen company is already a competitor, from which list it
  // came — so the checkbox is not offered for one that already is.
  const pickedIsCompetitor = useMemo(
    () => picked != null && competitors.some(c => c.id === picked.id),
    [picked, competitors],
  );

  const submit = async (answer: SwitchAnswer) => {
    setSaving(true);
    try {
      const ok = await record({
        account_id: prompt.accountId,
        incumbent_company_id: prompt.outgoing.id,
        incumbent_relationship_id: prompt.relationshipId,
        incoming_company_id: answer === 'replacing' ? picked?.id ?? null : null,
        answer,
        mark_competitor: answer === 'replacing' && !pickedIsCompetitor && markCompetitor,
        vendor_type: vendorType,
      });
      onDone(ok);
    } finally {
      setSaving(false);
    }
  };

  const group = (label: string, list: PickerOption[]) => list.length > 0 && (
    <div>
      <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
      <div className="space-y-1">
        {list.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => setPicked(c)}
            aria-pressed={picked?.id === c.id}
            className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-all ${
              picked?.id === c.id
                ? 'border-brand-secondary bg-brand-secondary/5 font-semibold text-brand-primary'
                : 'border-gray-100 bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Shell
      title="Replaced by"
      subtitle={`${prompt.accountName} has left ${prompt.outgoing.name}. Who took over?`}
      onClose={() => onDone(false)}
    >
      <input
        type="search"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search companies"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-secondary/40"
      />

      {/* Competitors lead, in full. They are short, almost always what the rep
          is reaching for, and the only set the competitive map can draw. */}
      {group('Competitors', competitors)}
      {group('Other companies', others)}
      {truncated && (
        <p className="text-[11px] text-gray-400">More companies match — keep typing to narrow it.</p>
      )}
      {competitors.length === 0 && others.length === 0 && (
        <p className="text-xs text-gray-400 py-2">No companies match.</p>
      )}

      {picked && (
        <div className="space-y-2 rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-600">
            Recording <span className="font-semibold">{picked.name}</span> as the current vendor.
          </p>
          {/* Prefilled from the outgoing relationship because a switch is
              usually like-for-like, and SHOWN because a wrong one that is
              silent is a mislabelled vendor nobody ever notices. */}
          <label className="block">
            <span className="block text-[11px] font-semibold text-gray-500 mb-1">Vendor type</span>
            <input
              type="text"
              value={vendorType.join(', ')}
              onChange={e => setVendorType(e.target.value.split(',').map(v => v.trim()).filter(Boolean))}
              placeholder="Same as the previous vendor"
              className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-secondary/40"
            />
          </label>
          {!pickedIsCompetitor && (
            <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={markCompetitor}
                onChange={e => setMarkCompetitor(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300"
              />
              <span>
                Also mark <span className="font-semibold">{picked.name}</span> as a Competitor.
              </span>
            </label>
          )}
        </div>
      )}

      <div className="space-y-2 pt-1">
        <button
          type="button"
          disabled={saving || !picked}
          onClick={() => submit('replacing')}
          className="w-full rounded-lg bg-brand-secondary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {picked ? `Replaced by ${picked.name}` : 'Pick a company'}
        </button>
        <div className="flex gap-2">
          {/* Leaving for nobody is a real outcome, not a missing answer. */}
          <button
            type="button"
            disabled={saving}
            onClick={() => submit('none')}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Nobody
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => submit('unknown')}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Don&apos;t know
          </button>
        </div>
      </div>
    </Shell>
  );
}
