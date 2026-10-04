/**
 * Runs the real GET /api/config against the database at STUB_DB_URL and
 * prints what it returned, so the parent can compare one request for several
 * categories against the separate requests it replaced.
 */
const { GET } = await import('@/app/api/config/route');

const res = await GET(new Request(`https://test.local/api/config${process.env.STUB_QUERY ?? ''}`));
const body = await res.json();
console.log('RESULT ' + JSON.stringify({ status: res.status, rows: body }));
