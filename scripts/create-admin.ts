/**
 * Bootstrap script: create the first administrator user.
 *
 * Usage:
 *   npx tsx scripts/create-admin.ts <email> <password>
 *
 * Example:
 *   npx tsx scripts/create-admin.ts admin@procarehr.com MySecurePass123
 *
 * Requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in environment
 * (set them in .env.local or pass inline).
 */

import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';

async function main() {
  const [, , email, password] = process.argv;

  if (!email || !password) {
    console.error('Usage: npx tsx scripts/create-admin.ts <email> <password>');
    process.exit(1);
  }

  if (!email.endsWith('@procarehr.com')) {
    console.error('Error: email must be a @procarehr.com address.');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Error: password must be at least 8 characters.');
    process.exit(1);
  }

  const dbUrl = process.env.TURSO_DATABASE_URL;
  const dbToken = process.env.TURSO_AUTH_TOKEN;

  if (!dbUrl || !dbToken) {
    console.error('Error: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set.');
    console.error('Tip: run with: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx scripts/create-admin.ts ...');
    process.exit(1);
  }

  const db = createClient({ url: dbUrl, authToken: dbToken });

  // Ensure users table exists
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'administrator')),
      email_verified INTEGER NOT NULL DEFAULT 0,
      verification_token TEXT,
      reset_token TEXT,
      reset_token_expires INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Check for existing user
  const existing = await db.execute({
    sql: 'SELECT id, role FROM users WHERE email = ?',
    args: [email.toLowerCase()],
  });

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    if (row.role === 'administrator') {
      console.log(`Administrator already exists: ${email}`);
    } else {
      // Upgrade existing user to administrator
      const hash = await bcrypt.hash(password, 12);
      await db.execute({
        sql: "UPDATE users SET password_hash = ?, role = 'administrator', email_verified = 1 WHERE email = ?",
        args: [hash, email.toLowerCase()],
      });
      console.log(`Upgraded existing user to administrator: ${email}`);
    }
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.execute({
    sql: `INSERT INTO users (email, password_hash, role, email_verified)
          VALUES (?, ?, 'administrator', 1)`,
    args: [email.toLowerCase(), passwordHash],
  });

  console.log(`Administrator created successfully: ${email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err.message ?? err);
  process.exit(1);
});
