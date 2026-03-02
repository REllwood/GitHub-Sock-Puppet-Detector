import Link from 'next/link';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function getAlerts() {
  return await prisma.alert.findMany({
    where: { dismissed: false },
    include: {
      repository: true,
    },
    orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
  });
}

export default async function AlertsPage() {
  const alerts = await getAlerts();

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
        <h1 className="text-3xl font-bold">Active Alerts</h1>
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
                  <Link
                    href={`https://github.com/${alert.repository.fullName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {alert.repository.fullName}
                  </Link>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  {new Date(alert.createdAt).toLocaleDateString()}
                </div>
              </div>

              <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                {alert.description}
              </p>

              {alert.accountsInvolved.length > 0 && (
                <div className="mb-4">
                  <div className="text-sm font-medium mb-2">Accounts involved:</div>
                  <div className="flex flex-wrap gap-2">
                    {alert.accountsInvolved.slice(0, 10).map(accountId => (
                      <span
                        key={accountId}
                        className="px-2 py-1 bg-white dark:bg-gray-700 rounded text-xs"
                      >
                        {accountId}
                      </span>
                    ))}
                    {alert.accountsInvolved.length > 10 && (
                      <span className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400">
                        +{alert.accountsInvolved.length - 10} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <form action={`/api/alerts/${alert.id}/dismiss`} method="POST">
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Dismiss
                  </button>
                </form>
                <Link
                  href={`/dashboard/analysis?repo=${alert.repositoryId}`}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View Analysis →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
