import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  pending: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
};

export default async function AnalysesPage({ searchParams }: { searchParams: { repo?: string } }) {
  const { repositoryFilter } = await requireViewer('/dashboard/analysis');
  const repositoryId = typeof searchParams.repo === 'string' ? searchParams.repo : undefined;

  const [repository, analyses] = await Promise.all([
    repositoryId
      ? prisma.repository.findFirst({ where: { id: repositoryId, ...repositoryFilter } })
      : null,
    prisma.analysis.findMany({
      where: {
        repository: repositoryFilter,
        ...(repositoryId ? { repositoryId } : {}),
      },
      include: {
        repository: { select: { fullName: true } },
        _count: { select: { accountResults: true } },
        accountResults: { select: { riskScore: true }, orderBy: { riskScore: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Analyses</h1>
        {repository && (
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            {repository.fullName} ·{' '}
            <Link
              href="/dashboard/analysis"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              show all repositories
            </Link>
          </p>
        )}
      </div>

      {analyses.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
          <h2 className="text-xl font-semibold mb-2">No analyses yet</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Analyses run automatically when new comments arrive, or start one from the{' '}
            <Link
              href="/dashboard/repositories"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              repositories page
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                {['Repository', 'Started', 'Trigger', 'Status', 'Accounts', 'Highest risk', ''].map(
                  heading => (
                    <th
                      key={heading}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                    >
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {analyses.map(analysis => (
                <tr key={analysis.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 text-sm font-medium">{analysis.repository.fullName}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {new Date(analysis.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {analysis.triggeredBy}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`text-xs px-2 py-1 rounded ${STATUS_STYLES[analysis.status] ?? ''}`}
                    >
                      {analysis.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">{analysis._count.accountResults}</td>
                  <td className="px-6 py-4 text-sm">
                    {analysis.accountResults[0]
                      ? analysis.accountResults[0].riskScore.toFixed(0)
                      : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <Link
                      href={`/dashboard/analysis/${analysis.id}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
