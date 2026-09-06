/**
 * Symmetric encryption for secrets held at rest — AES-256-GCM.
 *
 * Written for Slack bot tokens. The `oauth_connections` table stores its tokens
 * in plain text and is deliberately not retrofitted: it has no readers left and
 * its rows are inert. This is the first encryption-at-rest in the codebase.
 *
 * GCM rather than CBC because it authenticates as well as encrypts: a modified
 * ciphertext fails to decrypt rather than returning plausible rubbish, which
 * matters when the plaintext is a credential about to be sent to an API.
 *
 * The key comes from ENCRYPTION_KEY, 64 hex characters — `openssl rand -hex 32`.
 *
 * ── Why this throws at first use rather than at import ───────────────────────
 *
 * An import-time throw is louder, and for a service whose whole job needed the
 * key it would be right. Here it would take the entire application down because
 * one integration is misconfigured: this module is reached from the Slack store,
 * which is reached from route modules, and Next evaluates those during the
 * build. A missing ENCRYPTION_KEY would fail every page rather than the Slack
 * settings screen.
 *
 * So the key is read per call and the failure is scoped to the paths that need
 * it. What must never happen is the third option — falling back to storing
 * plaintext when the key is absent — so there is no fallback here at all. If
 * the key is missing or malformed, nothing encrypts and nothing decrypts.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** `openssl rand -hex 32` — 32 bytes as 64 hex characters. */
const KEY_HEX_LENGTH = 64;
const HEX = /^[0-9a-fA-F]+$/;

/** 96 bits, the size GCM is specified around. */
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Marks the scheme, so a later change of algorithm or layout can be told apart
 * from a corrupt value rather than failing as one.
 */
const VERSION = 'v1';
const SEPARATOR = '.';

export class EncryptionKeyError extends Error {
  constructor(message: string) {
    super(`ENCRYPTION_KEY ${message}. Generate one with: openssl rand -hex 32`);
    this.name = 'EncryptionKeyError';
  }
}

export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptionError';
  }
}

/**
 * The key, validated on every call.
 *
 * Read rather than cached: a cached key would be captured at first use, and the
 * process that read it may have started before the variable was set.
 */
function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new EncryptionKeyError('is not set');
  if (raw.length !== KEY_HEX_LENGTH) {
    throw new EncryptionKeyError(`must be ${KEY_HEX_LENGTH} hex characters, got ${raw.length}`);
  }
  if (!HEX.test(raw)) throw new EncryptionKeyError('must be hex characters only');
  return Buffer.from(raw, 'hex');
}

/**
 * Encrypt a string for storage.
 *
 * Returns `v1.<iv>.<tag>.<ciphertext>`, all hex — one column, no second field
 * to keep in step, and self-describing enough to decrypt without knowing how it
 * was produced. A fresh IV per call, so encrypting the same token twice gives
 * two different values.
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('hex'), tag.toString('hex'), ciphertext.toString('hex')].join(SEPARATOR);
}

/**
 * Decrypt a value produced by `encrypt`.
 *
 * Throws on a malformed value, on the wrong key, and on any modification to the
 * ciphertext — GCM's tag check is what makes the last one a failure rather than
 * silently different plaintext.
 */
export function decrypt(value: string): string {
  const parts = value.split(SEPARATOR);
  if (parts.length !== 4) {
    throw new DecryptionError(`Malformed ciphertext: expected 4 parts, got ${parts.length}`);
  }
  const [version, ivHex, tagHex, ciphertextHex] = parts;
  if (version !== VERSION) {
    throw new DecryptionError(`Unknown ciphertext version '${version}'`);
  }
  if (ivHex.length !== IV_BYTES * 2 || tagHex.length !== TAG_BYTES * 2) {
    throw new DecryptionError('Malformed ciphertext: iv or auth tag is the wrong length');
  }
  if (!HEX.test(ivHex) || !HEX.test(tagHex) || (ciphertextHex !== '' && !HEX.test(ciphertextHex))) {
    throw new DecryptionError('Malformed ciphertext: not hex');
  }

  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Wrong key, or the value was altered. Deliberately one message for both:
    // which of the two it was is not something a caller can act on, and saying
    // would tell an attacker whether they had the right key.
    throw new DecryptionError('Could not decrypt: wrong key or altered ciphertext');
  }
}

/**
 * Whether a usable key is configured, for a caller that wants to degrade rather
 * than throw — a settings screen saying the integration is unavailable, say.
 * Never use this to decide to store something unencrypted.
 */
export function isEncryptionConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}
