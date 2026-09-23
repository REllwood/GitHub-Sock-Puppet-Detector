import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { generateFlagReasons, getRiskLevel } from '@/lib/detection/risk-scorer';
import { formatDays, getAccountAgeInDays } from '@/lib/detection/account-age';
import { requireViewer } from '@/lib/viewer';
import RiskBadge from '@/components/ui/RiskBadge';
import AutoRefresh from '@/components/AutoRefresh';
import type { AccountDetections, ClusterDetection } from '@/types/analysis';

export const dynamic = 'force-dynamic';

async function getAnalysis(id: string, repositoryFilter: Prisma.RepositoryWhereInput) {
  return await prisma.analysis.findFirst({
    where: { id, repository: repositoryFilter },
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

const CLUSTER_LABELS: Record<ClusterDetection['type'], string> = {
  coordination: 'Coordinated accounts',
  temporal: 'Newcomer burst',
  llm: 'LLM-identified group',
};

function describeCluster(cluster: ClusterDetection): string {
  const parts: string[] = [];
  if (cluster.patterns?.length) parts.push(cluster.patterns.join(', '));
  if (cluster.thread) parts.push(`thread #${cluster.thread}`);
  if (cluster.timeWindow) {
    parts.push(
      `${new Date(cluster.timeWindow.start).toLocaleString()} – ${new Date(cluster.timeWindow.end).toLocaleString()}`
    );
  }
  return parts.join(' · ');
}

export default async function AnalysisDetailPage({ params }: { params: { id: string } }) {
  const { repositoryFilter } = await requireViewer(`/dashboard/analysis/${params.id}`);
  const analysis = await getAnalysis(params.id, repositoryFilter);

  if (!analysis) {
    notFound();
  }

  const running = analysis.status === 'pending' || analysis.status === 'processing';
  const clusters = analysis.detectedClusters as unknown as ClusterDetection[];

  const riskLevels = {
    critical: analysis.accountResults.filter(a => getRiskLevel(a.riskScore) === 'critical'),
    high: analysis.accountResults.filter(a => getRiskLevel(a.riskScore) === 'high'),
    medium: analysis.accountResults.filter(a => getRiskLevel(a.riskScore) === 'medium'),
    low: analysis.accountResults.filter(a => getRiskLevel(a.riskScore) === 'low'),
  };

  return (
    <div>
      {running && <AutoRefresh />}

      <div className="mb-8">
        <Link
          href={`/dashboard/analysis?repo=${analysis.repositoryId}`}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-2 inline-block"
        >
          ← All analyses for {analysis.repository.fullName}
        </Link>
        <h1 className="text-3xl font-bold mb-2">Analysis Results</h1>
        <p className="text-gray-600 dark:text-gray-400">
          {analysis.repository.fullName} • Started {new Date(analysis.createdAt).toLocaleString()} •
          Triggered by {analysis.triggeredBy === 'manual' ? 'a manual request' : 'new comments'}
        </p>
      </div>

      {running && (
        <div className="mb-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4 text-sm text-blue-800 dark:text-blue-200">
          Analysis {analysis.status === 'pending' ? 'queued' : 'in progress'}: syncing comments and
          profiles from GitHub, then running the detectors. This page updates automatically.
        </div>
      )}

      {analysis.status === 'failed' && (
        <div className="mb-8 rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-800 dark:text-red-200">
          Analysis failed: {analysis.errorMessage ?? 'unknown error'}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
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
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg shadow p-4">
          <div className="text-sm text-green-600 dark:text-green-400 mb-1">Low Risk</div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {riskLevels.low.length}
          </div>
        </div>
      </div>

      {clusters.length > 0 && (
        <div className="mb-8 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Detected Groups</h2>
          <div className="space-y-4">
            {clusters.map((cluster, index) => (
              <div
                key={index}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
              >
                <div className="font-medium mb-1">
                  {CLUSTER_LABELS[cluster.type] ?? 'Group'} (score {cluster.score.toFixed(0)})
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {describeCluster(cluster)}
                </div>
                <div className="flex flex-wrap gap-2">
                  {cluster.accounts.map(username => (
                    <Link
                      key={username}
                      href={`/dashboard/accounts/${encodeURIComponent(username)}`}
                      className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs hover:underline"
                    >
                      {username}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold">Analysed Accounts</h2>
        </div>
        {analysis.accountResults.length === 0 ? (
          <p className="px-6 py-8 text-sm text-gray-600 dark:text-gray-400">
            {running
              ? 'Results will appear here when the analysis finishes.'
              : 'No comments to analyse yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  {['Account', 'Risk', 'Account Age', 'Why'].map(heading => (
                    <th
                      key={heading}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {analysis.accountResults.map(result => {
                  const level = getRiskLevel(result.riskScore);
                  const accountAge = getAccountAgeInDays(result.account.createdAt);
                  const reasons = generateFlagReasons(
                    result.detections as unknown as AccountDetections
                  );

                  return (
                    <tr
                      key={result.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 align-top"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium">
                          <Link
                            href={`/dashboard/accounts/${encodeURIComponent(result.account.username)}`}
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {result.account.username}
                          </Link>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {result.account.email || 'No public email'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <RiskBadge level={level} score={result.riskScore} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {accountAge === null ? 'Unknown' : formatDays(accountAge)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                        {reasons.length > 0 ? (
                          <ul className="space-y-1">
                            {reasons.slice(0, 3).map(reason => (
                              <li key={reason}>{reason}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-gray-400">Nothing suspicious</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
