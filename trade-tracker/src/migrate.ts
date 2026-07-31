import { migrate, closePool } from './db.js';

await migrate();
await closePool();
console.log('migrate ok');
