/**
 * Runs the real POST /api/notes against the database at STUB_DB_URL and prints
 * every entity_notes row the call left behind, so the parent can see whether a
 * note written on an attendee reached the company and the conference.
 */
const mod = await import('@/app/api/notes/route');
const { createClient } = await import('@libsql/client');
const db = createClient({ url: process.env.STUB_DB_URL });

const body = JSON.parse(process.env.STUB_BODY);
const req = new Request('https://test.local/api/notes', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

let out;
try {
  const res = await mod.POST(req);
  let json = null;
  try { json = await res.json(); } catch {}
  const rows = await db.execute({
    sql: `SELECT entity_type, entity_id, conference_id, attendee_name, company_name
          FROM entity_notes WHERE content = ? ORDER BY entity_type`,
    args: [body.content],
  });
  out = { status: res.status, id: json?.id ?? null, rows: rows.rows.map(r => ({
    type: String(r.entity_type), id: Number(r.entity_id),
    conf: r.conference_id == null ? null : Number(r.conference_id),
    att: r.attendee_name == null ? null : String(r.attendee_name),
    co: r.company_name == null ? null : String(r.company_name),
  })) };
} catch (e) {
  out = { threw: String((e && e.message) || e) };
}
console.log('RESULT ' + JSON.stringify(out));
