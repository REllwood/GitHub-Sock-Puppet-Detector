'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/repositories', label: 'Repositories' },
  { href: '/dashboard/analysis', label: 'Analyses' },
  { href: '/dashboard/alerts', label: 'Alerts' },
];

export default function DashboardNav() {
  const { data: session } = useSession();
  const pathname = usePathname();

  // Overview is only active on its own page; other sections include their sub-pages
  const isActive = (path: string) =>
    path === '/dashboard'
      ? pathname === path
      : pathname === path || pathname.startsWith(`${path}/`);

  return (
    <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link href="/dashboard" className="text-xl font-bold">
              Sock Puppet Detector
            </Link>
            <div className="flex space-x-4">
              {NAV_ITEMS.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    isActive(item.href)
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {session?.user && (
              <>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {session.user.login || session.user.name || session.user.email}
                </span>
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                >
                  Sign Out
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
