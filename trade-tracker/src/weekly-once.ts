import { getPool, migrate, closePool } from './db.js';
import { postWeeklyReport } from './store.js';

await migrate();
const pool = getPool();
const result = await postWeeklyReport(pool, process.env.DISCORD_WEBHOOK_URL || undefined);
console.log(JSON.stringify({ ok: result.ok, week: result.stats.week, all: result.stats.all }, null, 2));
await closePool();
