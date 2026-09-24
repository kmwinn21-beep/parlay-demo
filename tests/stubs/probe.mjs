const { requireCapability } = await import('@/lib/requireCapability');
const req = { cookies: { get: () => undefined }, headers: { get: () => null }, url: 'https://x/' };
const res = await requireCapability(req, process.env.STUB_CAP ?? 'delete_merge');
const isResponse = typeof res?.status === 'number' && typeof res?.json === 'function';
let body = null;
if (isResponse) { try { body = await res.json(); } catch {} }
console.log('RESULT ' + JSON.stringify({
  status: isResponse ? res.status : 'allowed',
  error: body?.error ?? null,
  capability: body?.capability ?? null,
  askedFor: globalThis.__askedFor ?? null,
}));
