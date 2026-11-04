// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import { migrate, closePool } from './db.js';

await migrate();
await closePool();
console.log('migrate ok');
