import pg from 'pg';
const { Pool } = pg;

let pool: InstanceType<typeof Pool> | null = null;

export function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('sslmode=require') || process.env.DB_SSL === '1'
        ? { rejectUnauthorized: false }
        : undefined,
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

/** Convert snake_case DB row keys to camelCase for frontend compatibility. */
export function toCamelCase<T = Record<string, any>>(row: Record<string, any>): T {
  const result: Record<string, any> = {};
  for (const key of Object.keys(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    result[camelKey] = row[key];
  }
  return result as T;
}
