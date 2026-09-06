/**
 * Secrets survive a round trip, and nothing else does.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/encryption.mjs
 *
 * The failure mode this is written against is a silent fallback to plaintext.
 * A missing or malformed key must stop encryption happening at all, rather than
 * quietly storing the token as-is — so the "throws" cases below matter as much
 * as the round trip.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
const KEY_A = 'a'.repeat(64);
const KEY_B = '0123456789abcdef'.repeat(4);

process.env.ENCRYPTION_KEY = KEY_A;

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};
/** Asserts fn throws, and returns the message so the reason can be checked. */
const throws = (label, fn) => {
  try {
    fn();
    fail++;
    console.log(`  FAIL ${label}\n       did not throw`);
    return '';
  } catch (err) {
    pass++;
    console.log(`  ok   ${label}`);
    return err?.message ?? '';
  }
};

const { encrypt, decrypt, isEncryptionConfigured } = await import('@/lib/encryption');

/** Produced under KEY_A, for the cases that swap the key out underneath it. */
const encryptedWithA = encrypt('secret-token');

const withKey = (value, fn) => {
  const previous = process.env.ENCRYPTION_KEY;
  if (value === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = value;
  try { return fn(); } finally { process.env.ENCRYPTION_KEY = previous; }
};

// ── Round trip ───────────────────────────────────────────────────────────────

console.log('\n— a secret survives the round trip —');
{
  // Not a Slack-shaped literal on purpose: a real-looking token trips secret
  // scanning, and what is under test is the round trip, not the format.
  const token = 'fixture-bot-credential-0000000000-AbCdEfGhIjKlMnOpQrStUvWx';
  eq('a credential-shaped token comes back intact', decrypt(encrypt(token)), token);
}
{
  eq('an empty string round-trips', decrypt(encrypt('')), '');
}
{
  const unicode = 'Ünïcødé — “smart” quotes, emoji 🔐, tabs\tand\nnewlines';
  eq('non-ASCII survives', decrypt(encrypt(unicode)), unicode);
}
{
  const long = 'x'.repeat(10_000);
  eq('a long value survives', decrypt(encrypt(long)), long);
}

console.log('\n— the ciphertext itself —');
{
  const out = encrypt('hello');
  eq('is versioned and four-part', out.split('.').length, 4);
  eq('  starts with the version', out.split('.')[0], 'v1');
  eq('  does not contain the plaintext', out.includes('hello'), false);
}
{
  // A fresh IV each time, so the same secret does not produce a recognisable
  // constant in the database.
  eq('the same plaintext encrypts differently each time',
    encrypt('same-token') === encrypt('same-token'), false);
}
{
  const token = 'repeatable';
  const a = encrypt(token);
  const b = encrypt(token);
  eq('  and both still decrypt', [decrypt(a), decrypt(b)], [token, token]);
}

// ── Tampering ────────────────────────────────────────────────────────────────

console.log('\n— a modified ciphertext does not decrypt —');
{
  const out = encrypt('secret-token');
  const [v, iv, tag, ct] = out.split('.');
  const flip = (hex) => {
    const last = hex.slice(-1);
    return hex.slice(0, -1) + (last === '0' ? '1' : '0');
  };
  throws('a flipped bit in the ciphertext throws', () => decrypt([v, iv, tag, flip(ct)].join('.')));
  throws('a flipped bit in the auth tag throws', () => decrypt([v, iv, flip(tag), ct].join('.')));
  throws('a flipped bit in the iv throws', () => decrypt([v, flip(iv), tag, ct].join('.')));
}
{
  throws('a truncated value throws', () => decrypt('v1.abc.def'));
  throws('an empty string throws', () => decrypt(''));
  throws('plaintext masquerading as ciphertext throws', () => decrypt('fixture-not-encrypted'));
  throws('an unknown version throws', () => {
    const [, iv, tag, ct] = encrypt('x').split('.');
    return decrypt(['v2', iv, tag, ct].join('.'));
  });
  throws('a non-hex body throws', () => {
    const [v, iv, tag] = encrypt('x').split('.');
    return decrypt([v, iv, tag, 'zzzz'].join('.'));
  });
}

// ── The wrong key ────────────────────────────────────────────────────────────

console.log('\n— the wrong key does not decrypt —');
{
  const out = encrypt('secret-token');
  const message = withKey(KEY_B, () => throws('a different key throws', () => decrypt(out)));
  eq('  and does not say which of wrong-key or tampering it was',
    /wrong key or altered/.test(message), true);
}

// ── A missing or malformed key ───────────────────────────────────────────────

console.log('\n— a missing or malformed key stops everything —');
{
  withKey(undefined, () => {
    const message = throws('encrypt throws when the key is unset', () => encrypt('x'));
    eq('  and says how to generate one', /openssl rand -hex 32/.test(message), true);
    throws('decrypt throws when the key is unset', () => decrypt(encryptedWithA));
    eq('  isEncryptionConfigured reports false', isEncryptionConfigured(), false);
  });
}
{
  withKey('', () => throws('an empty key throws', () => encrypt('x')));
  withKey('abc', () => {
    const message = throws('a short key throws', () => encrypt('x'));
    eq('  and says the expected length', /64 hex characters/.test(message), true);
  });
  withKey('a'.repeat(65), () => throws('a long key throws', () => encrypt('x')));
  withKey('z'.repeat(64), () => {
    const message = throws('a right-length non-hex key throws', () => encrypt('x'));
    eq('  and says it must be hex', /hex characters only/.test(message), true);
  });
  withKey(`${'a'.repeat(63)} `, () => throws('a key with trailing whitespace throws', () => encrypt('x')));
}
{
  eq('isEncryptionConfigured reports true for a good key', isEncryptionConfigured(), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
