import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getAppInstallUrl } from '@/lib/app-config';
import { requireViewer } from '@/lib/viewer';
import SubmitButton from '@/components/SubmitButton';
import { analyseRepositoryAction } from '../actions';

export const dynamic = 'force-dynamic';

async function getRepositories(repositoryFilter: Prisma.RepositoryWhereInput) {
  return await prisma.repository.findMany({
    where: repositoryFilter,
    include: {
      analyses: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      _count: {
        select: {
          analyses: true,
          comments: true,
          alerts: { where: { dismissed: false } },
        },
      },
    },
    orderBy: { fullName: 'asc' },
  });
}

function InstallButton({ className }: { className: string }) {
  const installUrl = getAppInstallUrl();
  if (!installUrl) return null;

  return (
    <a href={installUrl} target="_blank" rel="noopener noreferrer" className={className}>
      Install GitHub App
    </a>
  );
}

export default async function RepositoriesPage() {
  const { repositoryFilter } = await requireViewer('/dashboard/repositories');
  const repositories = await getRepositories(repositoryFilter);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Repositories</h1>
        <InstallButton className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors" />
      </div>

      {repositories.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
          <h2 className="text-xl font-semibold mb-4">No repositories yet</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Install the GitHub App on your repositories to start detecting sock puppet accounts.
            Repositories appear here once the app is installed on them and you have access to them
            on GitHub.
          </p>
          <InstallButton className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors" />
        </div>
      ) : (
        <div className="grid gap-6">
          {repositories.map(repo => {
            const lastAnalysis = repo.analyses[0];
            const activeAlerts = repo._count.alerts;
            const running =
              lastAnalysis?.status === 'pending' || lastAnalysis?.status === 'processing';

            return (
              <div
                key={repo.id}
                className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-2">
                      <a
                        href={`https://github.com/${repo.fullName}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {repo.fullName}
                      </a>
                    </h3>

                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                      <span>{repo._count.comments} comments</span>
                      <span>{repo._count.analyses} analyses</span>
                      {activeAlerts > 0 && (
                        <span className="text-red-600 dark:text-red-400 font-medium">
                          {activeAlerts} active alert{activeAlerts !== 1 ? 's' : ''}
                        </span>
                      )}
                      {lastAnalysis && (
                        <span>
                          Last analysis: {new Date(lastAnalysis.createdAt).toLocaleString()} (
                          {lastAnalysis.status})
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
                    {running ? (
                      <Link
                        href={`/dashboard/analysis/${lastAnalysis.id}`}
                        className="px-4 py-2 text-sm bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-lg"
                      >
                        Analysis running…
                      </Link>
                    ) : (
                      <form action={analyseRepositoryAction.bind(null, repo.id)}>
                        <SubmitButton
                          pendingText="Starting…"
                          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          Analyse Now
                        </SubmitButton>
                      </form>
                    )}
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
