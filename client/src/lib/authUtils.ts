// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}