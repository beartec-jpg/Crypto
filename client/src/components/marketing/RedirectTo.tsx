// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import { useLayoutEffect } from 'react';
import { useLocation } from 'wouter';

export function RedirectTo({ to }: { to: string }) {
  const [, setLocation] = useLocation();

  useLayoutEffect(() => {
    setLocation(to);
  }, [to, setLocation]);

  return null;
}
