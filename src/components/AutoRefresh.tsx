'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Re-render the current server page periodically (e.g. while an analysis is running)
 */
export default function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return null;
}
