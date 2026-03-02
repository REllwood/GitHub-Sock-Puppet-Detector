import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getRiskLevel } from '@/lib/detection/risk-scorer';

export const dynamic = 'force-dynamic';

async function getDashboardStats() {
  const [totalRepos, totalAccounts, totalAlerts, recentAnalyses] = await Promise.all([
    prisma.repository.count(),
    prisma.account.count(),
    prisma.alert.count({ where: { dismissed: false } }),
    prisma.analysis.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        repository: true,
        accountResults: {
          include: { account: true },
        },
      },
    }),
  ]);

  // Get risk distribution
  const accounts = await prisma.account.findMany({
    select: { riskScore: true },
  });

  const riskDistribution = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  accounts.forEach(account => {
    const level = getRiskLevel(account.riskScore);
    riskDistribution[level]++;
  });

  return {
    totalRepos,
    totalAccounts,
    totalAlerts,
    recentAnalyses,
    riskDistribution,
  };
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Dashboard Overview</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
            Repositories
          </div>
          <div className="text-3xl font-bold">{stats.totalRepos}</div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
            Accounts Analysed
          </div>
          <div className="text-3xl font-bold">{stats.totalAccounts}</div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
            Active Alerts
          </div>
          <div className="text-3xl font-bold text-red-600 dark:text-red-400">
            {stats.totalAlerts}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
            Critical Accounts
          </div>
          <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
            {stats.riskDistribution.critical}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Risk Distribution</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Low Risk</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {stats.riskDistribution.low} accounts
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full"
                style={{
                  width: `${(stats.riskDistribution.low / stats.totalAccounts) * 100}%`,
                }}
              ></div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Medium Risk</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {stats.riskDistribution.medium} accounts
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-yellow-600 h-2 rounded-full"
                style={{
                  width: `${(stats.riskDistribution.medium / stats.totalAccounts) * 100}%`,
                }}
              ></div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">High Risk</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {stats.riskDistribution.high} accounts
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-orange-600 h-2 rounded-full"
                style={{
                  width: `${(stats.riskDistribution.high / stats.totalAccounts) * 100}%`,
                }}
              ></div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Critical Risk</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {stats.riskDistribution.critical} accounts
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-red-600 h-2 rounded-full"
                style={{
                  width: `${(stats.riskDistribution.critical / stats.totalAccounts) * 100}%`,
                }}
              ></div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Recent Analyses</h2>
          <div className="space-y-4">
            {stats.recentAnalyses.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                No analyses yet. Install the GitHub App on a repository to start.
              </p>
            ) : (
              stats.recentAnalyses.map(analysis => (
                <Link
                  key={analysis.id}
                  href={`/dashboard/analysis/${analysis.id}`}
                  className="block hover:bg-gray-50 dark:hover:bg-gray-700 p-3 rounded-lg transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{analysis.repository.fullName}</span>
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {new Date(analysis.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {analysis.accountResults.length} accounts analysed
                    </span>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        analysis.status === 'completed'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : analysis.status === 'failed'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                      }`}
                    >
                      {analysis.status}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
          <div className="mt-4">
            <Link
              href="/dashboard/repositories"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              View all repositories →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
