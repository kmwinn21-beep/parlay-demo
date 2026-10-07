/**
 * Runs the real POST/DELETE /api/social-events/[id]/guest against the database
 * at STUB_DB_URL and prints what it returned, so the parent can see which of
 * the two calls the Build Guest List save makes is the one that fails.
 */
const mod = await import('@/app/api/social-events/[id]/guest/route');
const method = process.env.STUB_METHOD ?? 'POST';
const id = process.env.STUB_EVENT_ID ?? '1';

const req = new Request(`https://test.local/api/social-events/${id}/guest`, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ attendee_id: Number(process.env.STUB_ATTENDEE_ID ?? 1) }),
});

let out;
try {
  const res = await mod[method](req, { params: { id } });
  let body = null;
  try { body = await res.json(); } catch {}
  out = { status: res.status, body };
} catch (e) {
  out = { threw: String(e && e.message || e) };
}
console.log('RESULT ' + JSON.stringify(out));
