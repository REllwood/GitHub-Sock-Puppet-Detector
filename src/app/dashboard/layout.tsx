import { ReactNode } from 'react';
import DashboardNav from '@/components/DashboardNav';

// Access is enforced by middleware (signed-in users only) and each page scopes its data
// to the repositories the viewer can access
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNav />
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
