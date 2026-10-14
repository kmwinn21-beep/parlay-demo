/**
 * Runs the real DELETE /api/meetings/[id] against STUB_DB_URL and reports what
 * is left of the meeting and of the notes written against it, so the parent can
 * see whether a meeting's own notes go with it.
 */
const mod = await import('@/app/api/meetings/[id]/route');
const { createClient } = await import('@libsql/client');
const db = createClient({ url: process.env.STUB_DB_URL });
const id = process.env.STUB_MEETING_ID ?? '1';

const count = async (sql, args) => Number((await db.execute({ sql, args })).rows[0].n);
const before = {
  meeting: await count('SELECT COUNT(*) n FROM meetings WHERE id = ?', [id]),
  ownNotes: await count(`SELECT COUNT(*) n FROM entity_notes WHERE entity_type = 'meeting' AND entity_id = ?`, [id]),
  otherNotes: await count(`SELECT COUNT(*) n FROM entity_notes WHERE entity_type != 'meeting'`, []),
};

let out;
try {
  const res = await mod.DELETE(new Request(`https://test.local/api/meetings/${id}`, { method: 'DELETE' }), { params: { id } });
  let body = null; try { body = await res.json(); } catch {}
  out = { status: res.status, body, before, after: {
    meeting: await count('SELECT COUNT(*) n FROM meetings WHERE id = ?', [id]),
    ownNotes: await count(`SELECT COUNT(*) n FROM entity_notes WHERE entity_type = 'meeting' AND entity_id = ?`, [id]),
    otherNotes: await count(`SELECT COUNT(*) n FROM entity_notes WHERE entity_type != 'meeting'`, []),
    otherMeetingNotes: await count(`SELECT COUNT(*) n FROM entity_notes WHERE entity_type = 'meeting' AND entity_id != ?`, [id]),
  } };
} catch (e) {
  out = { threw: String((e && e.message) || e) };
}
console.log('RESULT ' + JSON.stringify(out));
