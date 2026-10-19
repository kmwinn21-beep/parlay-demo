/**
 * Runs the real meetings routes against the database at STUB_DB_URL and prints
 * what the duration column holds afterwards — the one thing reading the code
 * cannot tell you, since the column is nullable and three callers write it.
 *
 * STUB_PLAN is a JSON array of steps, run in order in ONE process: loading
 * the routes costs seconds, and a step per process made the test slower than
 * the rest of the suite put together.
 *
 *   {"op":"post","body":{…}}            → { status, id, stored }
 *   {"op":"put","id":12,"body":{…}}     → { status, stored }
 *   {"op":"get","conference":15}        → { status, returned:[{id,duration_minutes}] }
 *   {"op":"getOne","id":12}             → { status, duration_minutes }
 */
const list = await import('@/app/api/meetings/route');
const one = await import('@/app/api/meetings/[id]/route');
const { createClient } = await import('@libsql/client');
const db = createClient({ url: process.env.STUB_DB_URL });

const stored = async (id) => {
  const r = await db.execute({ sql: 'SELECT duration_minutes FROM meetings WHERE id = ?', args: [id] });
  const v = r.rows[0]?.duration_minutes;
  return v == null ? null : Number(v);
};

const run = async (step) => {
  if (step.op === 'post') {
    const res = await list.POST(new Request('https://test.local/api/meetings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(step.body ?? {}),
    }));
    const json = await res.json().catch(() => null);
    return {
      status: res.status, id: json?.id ?? null,
      stored: json?.id ? await stored(Number(json.id)) : null,
      ...(res.status >= 400 ? { error: json?.error ?? null } : {}),
    };
  }
  if (step.op === 'put') {
    const id = String(step.id);
    const res = await one.PUT(
      new Request(`https://test.local/api/meetings/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(step.body ?? {}),
      }),
      { params: { id } },
    );
    return { status: res.status, stored: await stored(Number(id)) };
  }
  if (step.op === 'get') {
    const res = await list.GET(new Request(`https://test.local/api/meetings?conference_id=${step.conference}`));
    const json = await res.json().catch(() => null);
    return {
      status: res.status,
      returned: Array.isArray(json)
        ? json.map(m => ({ id: m.id, duration_minutes: m.duration_minutes })).sort((a, b) => a.id - b.id)
        : null,
    };
  }
  if (step.op === 'getOne') {
    const id = String(step.id);
    const res = await one.GET(new Request(`https://test.local/api/meetings/${id}`), { params: { id } });
    const json = await res.json().catch(() => null);
    return { status: res.status, duration_minutes: json?.duration_minutes ?? null };
  }
  return { skipped: step.op };
};

const out = [];
for (const step of JSON.parse(process.env.STUB_PLAN ?? '[]')) {
  try {
    // `fromStep` names a meeting an earlier step created, so the plan can
    // edit what it booked without the parent knowing the ids.
    const resolved = step.fromStep != null ? { ...step, id: out[step.fromStep]?.id } : step;
    out.push(await run(resolved));
  } catch (e) {
    out.push({ threw: String((e && e.message) || e) });
  }
}
console.log('RESULT ' + JSON.stringify(out));
