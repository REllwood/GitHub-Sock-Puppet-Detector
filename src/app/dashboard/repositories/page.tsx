import Link from 'next/link';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function getRepositories() {
  return await prisma.repository.findMany({
    include: {
      analyses: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      alerts: {
        where: { dismissed: false },
      },
      _count: {
        select: {
          analyses: true,
          alerts: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export default async function RepositoriesPage() {
  const repositories = await getRepositories();

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Repositories</h1>
        <a
          href="https://github.com/apps/sock-puppet-detector"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Install GitHub App
        </a>
      </div>

      {repositories.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
          <h2 className="text-xl font-semibold mb-4">No repositories yet</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Install the GitHub App on your repositories to start detecting sock puppet accounts
          </p>
          <a
            href="https://github.com/apps/sock-puppet-detector"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Install GitHub App
          </a>
        </div>
      ) : (
        <div className="grid gap-6">
          {repositories.map(repo => {
            const lastAnalysis = repo.analyses[0];
            const activeAlerts = repo.alerts.length;

            return (
              <div
                key={repo.id}
                className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-2">
                      <Link
                        href={`https://github.com/${repo.fullName}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {repo.fullName}
                      </Link>
                    </h3>

                    <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                      <span>{repo._count.analyses} analyses</span>
                      {activeAlerts > 0 && (
                        <span className="text-red-600 dark:text-red-400 font-medium">
                          {activeAlerts} active alert{activeAlerts !== 1 ? 's' : ''}
                        </span>
                      )}
                      {lastAnalysis && (
                        <span>
                          Last analysed: {new Date(lastAnalysis.createdAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Link
                      href={`/dashboard/analysis?repo=${repo.id}`}
                      className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      View Analyses
                    </Link>
                    <form action={`/api/analyse/${repo.fullName}`} method="POST">
                      <button
                        type="submit"
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Analyse Now
                      </button>
                    </form>
                  </div>
                </div>

                {activeAlerts > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <Link
                      href={`/dashboard/alerts?repo=${repo.id}`}
                      className="text-sm text-red-600 dark:text-red-400 hover:underline"
                    >
                      View alerts →
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
