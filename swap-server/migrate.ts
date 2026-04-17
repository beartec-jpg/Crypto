/**
 * migrate.ts — Lightweight SQL migration runner for the QBTC Swap Server.
 *
 * Reads numbered *.sql files from ./migrations in lexicographic order,
 * applies only those not yet recorded in the schema_migrations table,
 * and records each applied migration in a transaction.
 *
 * Usage:
 *   node --import tsx migrate.ts
 *
 * This script is run as a separate step before starting the server
 * (see start.sh), so startup DDL never runs inside app.listen().
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error('[migrate] DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('sslmode=require') || process.env.DB_SSL === '1'
    ? { rejectUnauthorized: false }
    : undefined,
  max: 3,
  connectionTimeoutMillis: 10000,
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    // Ensure the migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Read all .sql files in lexicographic order
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('[migrate] No migration files found.');
      return;
    }

    for (const file of files) {
      // Check if already applied
      const { rows } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE name = $1',
        [file],
      );
      if (rows.length > 0) {
        console.log(`[migrate] ✓ ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (name) VALUES ($1)',
          [file],
        );
        await client.query('COMMIT');
        console.log(`[migrate] ✔ ${file} applied`);
      } catch (err: any) {
        await client.query('ROLLBACK');
        console.error(`[migrate] ✗ ${file} FAILED: ${err.message}`);
        throw err;
      }
    }

    console.log('[migrate] All migrations complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('[migrate] Fatal error:', err.message);
  process.exit(1);
});
