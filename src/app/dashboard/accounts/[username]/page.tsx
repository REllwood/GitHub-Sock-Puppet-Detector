import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getRiskLevel } from '@/lib/detection/risk-scorer';
import { formatDays, getAccountAgeInDays } from '@/lib/detection/account-age';
import { DETECTOR_LABELS } from '@/lib/format';
import { getScopedAccountRisk } from '@/lib/risk-summary';
import { requireViewer } from '@/lib/viewer';
import RiskBadge from '@/components/ui/RiskBadge';
import type { DetectionResult } from '@/types/analysis';

export const dynamic = 'force-dynamic';

async function getAccount(username: string, repositoryFilter: Prisma.RepositoryWhereInput) {
  // Only accounts that have commented in a repository the viewer can access
  const account = await prisma.account.findFirst({
    where: {
      username,
      comments: { some: { repository: repositoryFilter } },
    },
    include: {
      comments: {
        where: { repository: repositoryFilter },
        include: { repository: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      _count: {
        select: { comments: { where: { repository: repositoryFilter } } },
      },
    },
  });

  if (!account) return null;

  const risk = await getScopedAccountRisk(account.id, repositoryFilter);
  return { account, risk };
}

function commentUrl(comment: {
  repository: { fullName: string };
  issueNumber: number | null;
  prNumber: number | null;
}): string | null {
  const number = comment.issueNumber ?? comment.prNumber;
  if (number === null) return null;
  return `https://github.com/${comment.repository.fullName}/${comment.prNumber !== null ? 'pull' : 'issues'}/${number}`;
}

export default async function AccountDetailPage({ params }: { params: { username: string } }) {
  const username = decodeURIComponent(params.username);
  const { repositoryFilter } = await requireViewer(
    `/dashboard/accounts/${encodeURIComponent(username)}`
  );
  const result = await getAccount(username, repositoryFilter);

  if (!result) {
    notFound();
  }

  const { account, risk } = result;
  const riskLevel = getRiskLevel(risk.riskScore);
  const accountAge = getAccountAgeInDays(account.createdAt);
  const detections = risk.detections
    ? (Object.entries(risk.detections) as Array<[string, DetectionResult | undefined]>).filter(
        (entry): entry is [string, DetectionResult] => Boolean(entry[1])
      )
    : [];

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-2 inline-block"
        >
          ← Back to dashboard
        </Link>
        <div className="flex items-center gap-4 mb-4">
          <h1 className="text-3xl font-bold">{account.username}</h1>
          <RiskBadge level={riskLevel} score={risk.riskScore} />
          <a
            href={`https://github.com/${account.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            GitHub profile ↗
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
          <span>Account age: {accountAge === null ? 'Unknown' : formatDays(accountAge)}</span>
          <span>Comments: {account._count.comments}</span>
          {account.email && <span>Email: {account.email}</span>}
          {!account.profileSyncedAt && <span>Profile not yet synced from GitHub</span>}
        </div>
      </div>

      <div className="grid gap-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Detection Breakdown</h2>
          {detections.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">Not analysed yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                    <th className="py-2 pr-4">Detector</th>
                    <th className="py-2 pr-4">Score</th>
                    <th className="py-2">Finding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {detections.map(([key, detection]) => (
                    <tr key={key} className="align-top">
                      <td className="py-2 pr-4 font-medium whitespace-nowrap">
                        {DETECTOR_LABELS[key] ?? key}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {detection.evaluated === false ? (
                          <span className="text-gray-400">n/a</span>
                        ) : (
                          <span
                            className={detection.detected ? 'text-red-600 dark:text-red-400' : ''}
                          >
                            {detection.score.toFixed(0)}
                          </span>
                        )}
                      </td>
                      <td
                        className={`py-2 ${detection.detected ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}
                      >
                        {detection.evaluated === false
                          ? 'No data to evaluate'
                          : detection.reason || 'Nothing suspicious'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
          <div className="space-y-4">
            {account.comments.slice(0, 10).map(comment => {
              const url = commentUrl(comment);
              return (
                <div
                  key={comment.id}
                  className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 py-2"
                >
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                    {new Date(comment.createdAt).toLocaleString()} · {comment.repository.fullName}
                    {url && (
                      <>
                        {' · '}
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          #{comment.issueNumber ?? comment.prNumber}
                        </a>
                      </>
                    )}
                  </div>
                  <div className="text-sm line-clamp-3 whitespace-pre-line">{comment.content}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Analysis History</h2>
          <div className="space-y-3">
            {risk.history.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400">No analyses yet</p>
            ) : (
              risk.history.slice(0, 10).map(entry => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <div>
                    <div className="font-medium text-sm">{entry.analysis.repository.fullName}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {new Date(entry.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <RiskBadge level={getRiskLevel(entry.riskScore)} score={entry.riskScore} />
                    <Link
                      href={`/dashboard/analysis/${entry.analysisId}`}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      View
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
