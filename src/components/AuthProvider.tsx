'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';

export default function AuthProvider({ children }: { children: ReactNode }) {
  // Refreshing the session periodically also renews the GitHub user token before it expires
  return <SessionProvider refetchInterval={30 * 60}>{children}</SessionProvider>;
}
