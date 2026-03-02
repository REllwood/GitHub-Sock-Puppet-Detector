import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getRiskLevel } from '@/lib/detection/risk-scorer';
import RiskBadge from '@/components/ui/RiskBadge';

export const dynamic = 'force-dynamic';

async function getAnalysis(id: string) {
  return await prisma.analysis.findUnique({
    where: { id },
    include: {
      repository: true,
      accountResults: {
        include: {
          account: true,
        },
        orderBy: {
          riskScore: 'desc',
        },
      },
    },
  });
}

export default async function AnalysisDetailPage({ params }: { params: { id: string } }) {
  const analysis = await getAnalysis(params.id);

  if (!analysis) {
    notFound();
  }

  const riskLevels = {
    critical: analysis.accountResults.filter(a => getRiskLevel(a.riskScore) === 'critical'),
    high: analysis.accountResults.filter(a => getRiskLevel(a.riskScore) === 'high'),
    medium: analysis.accountResults.filter(a => getRiskLevel(a.riskScore) === 'medium'),
    low: analysis.accountResults.filter(a => getRiskLevel(a.riskScore) === 'low'),
  };

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/dashboard/repositories"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-2 inline-block"
        >
          ← Back to repositories
        </Link>
        <h1 className="text-3xl font-bold mb-2">Analysis Results</h1>
        <p className="text-gray-600 dark:text-gray-400">
          {analysis.repository.fullName} • Analysed on{' '}
          {new Date(analysis.createdAt).toLocaleString()}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Accounts</div>
          <div className="text-2xl font-bold">{analysis.accountResults.length}</div>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg shadow p-4">
          <div className="text-sm text-red-600 dark:text-red-400 mb-1">Critical Risk</div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {riskLevels.critical.length}
          </div>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg shadow p-4">
          <div className="text-sm text-orange-600 dark:text-orange-400 mb-1">High Risk</div>
          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
            {riskLevels.high.length}
          </div>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg shadow p-4">
          <div className="text-sm text-yellow-600 dark:text-yellow-400 mb-1">Medium Risk</div>
          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {riskLevels.medium.length}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold">Analysed Accounts</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Account
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Risk Level
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Score
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Account Age
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {analysis.accountResults.map(result => {
                const level = getRiskLevel(result.riskScore);
                const accountAge = Math.floor(
                  (Date.now() - new Date(result.account.createdAt).getTime()) /
                    (1000 * 60 * 60 * 24)
                );

                return (
                  <tr key={result.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div>
                          <div className="text-sm font-medium">
                            <Link
                              href={`/dashboard/accounts/${result.account.username}`}
                              className="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {result.account.username}
                            </Link>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {result.account.email || 'No email'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <RiskBadge level={level} score={result.riskScore} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {result.riskScore.toFixed(1)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {accountAge} days
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <Link
                        href={`/dashboard/accounts/${result.account.username}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {analysis.detectedClusters && analysis.detectedClusters.length > 0 && (
        <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Detected Clusters</h2>
          <div className="space-y-4">
            {(analysis.detectedClusters as any[]).map((cluster, index) => (
              <div
                key={index}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
              >
                <div className="font-medium mb-2">
                  Cluster {index + 1} ({cluster.type || 'network'})
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Accounts: {cluster.accounts?.join(', ') || 'Unknown'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
