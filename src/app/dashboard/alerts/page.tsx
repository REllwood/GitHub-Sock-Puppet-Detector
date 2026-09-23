import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { bySeverity } from '@/lib/format';
import { requireViewer } from '@/lib/viewer';
import SubmitButton from '@/components/SubmitButton';
import { dismissAlertAction } from '../actions';

export const dynamic = 'force-dynamic';

async function getAlerts(repositoryFilter: Prisma.RepositoryWhereInput, repositoryId?: string) {
  const alerts = await prisma.alert.findMany({
    where: {
      dismissed: false,
      repository: repositoryFilter,
      ...(repositoryId ? { repositoryId } : {}),
    },
    include: {
      repository: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Resolve the stored account IDs to usernames for display
  const accountIds = Array.from(new Set(alerts.flatMap(alert => alert.accountsInvolved)));
  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, username: true },
  });
  const usernames = new Map(accounts.map(account => [account.id, account.username]));

  return alerts.sort(bySeverity).map(alert => ({
    ...alert,
    usernames: alert.accountsInvolved
      .map(id => usernames.get(id))
      .filter((name): name is string => Boolean(name)),
  }));
}

export default async function AlertsPage({ searchParams }: { searchParams: { repo?: string } }) {
  const { repositoryFilter } = await requireViewer('/dashboard/alerts');
  const repositoryId = typeof searchParams.repo === 'string' ? searchParams.repo : undefined;
  const alerts = await getAlerts(repositoryFilter, repositoryId);

  const severityColors = {
    critical: 'border-red-500 bg-red-50 dark:bg-red-900/20',
    high: 'border-orange-500 bg-orange-50 dark:bg-orange-900/20',
    medium: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20',
    low: 'border-green-500 bg-green-50 dark:bg-green-900/20',
  };

  const severityBadges = {
    critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    low: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Active Alerts</h1>
          {repositoryId && (
            <Link
              href="/dashboard/alerts"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Show alerts for all repositories
            </Link>
          )}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
          <h2 className="text-xl font-semibold mb-2">No active alerts</h2>
          <p className="text-gray-600 dark:text-gray-400">
            All repositories are clear of suspicious activity
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map(alert => (
            <div
              key={alert.id}
              className={`border-l-4 rounded-lg shadow p-6 ${severityColors[alert.severity as keyof typeof severityColors]}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${severityBadges[alert.severity as keyof typeof severityBadges]}`}
                    >
                      {alert.severity.toUpperCase()}
                    </span>
                    <h3 className="text-lg font-semibold">{alert.title}</h3>
                  </div>
                  <a
                    href={`https://github.com/${alert.repository.fullName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {alert.repository.fullName}
                  </a>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  {new Date(alert.createdAt).toLocaleString()}
                </div>
              </div>

              <p className="text-sm text-gray-700 dark:text-gray-300 mb-4 whitespace-pre-line">
                {alert.description}
              </p>

              {alert.usernames.length > 0 && (
                <div className="mb-4">
                  <div className="text-sm font-medium mb-2">Accounts involved:</div>
                  <div className="flex flex-wrap gap-2">
                    {alert.usernames.slice(0, 10).map(username => (
                      <Link
                        key={username}
                        href={`/dashboard/accounts/${encodeURIComponent(username)}`}
                        className="px-2 py-1 bg-white dark:bg-gray-700 rounded text-xs hover:underline"
                      >
                        {username}
                      </Link>
                    ))}
                    {alert.usernames.length > 10 && (
                      <span className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400">
                        +{alert.usernames.length - 10} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <form action={dismissAlertAction.bind(null, alert.id)}>
                  <SubmitButton
                    pendingText="Dismissing…"
                    className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Dismiss
                  </SubmitButton>
                </form>
                <Link
                  href={`/dashboard/analysis?repo=${alert.repositoryId}`}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View analyses →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
