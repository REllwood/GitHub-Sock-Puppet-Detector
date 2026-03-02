import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getRiskLevel } from '@/lib/detection/risk-scorer';
import RiskBadge from '@/components/ui/RiskBadge';

export const dynamic = 'force-dynamic';

async function getAccount(username: string) {
  return await prisma.account.findUnique({
    where: { username },
    include: {
      comments: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      analyses: {
        include: {
          analysis: {
            include: {
              repository: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });
}

export default async function AccountDetailPage({
  params,
}: {
  params: { username: string };
}) {
  const account = await getAccount(params.username);

  if (!account) {
    notFound();
  }

  const riskLevel = getRiskLevel(account.riskScore);
  const accountAge = Math.floor(
    (Date.now() - new Date(account.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );

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
          <RiskBadge level={riskLevel} score={account.riskScore} />
        </div>
        <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
          <span>Account age: {accountAge} days</span>
          <span>Comments: {account.comments.length}</span>
          {account.email && <span>Email: {account.email}</span>}
        </div>
      </div>

      <div className="grid gap-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Detection Reasons</h2>
          {account.flagReasons.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">No suspicious patterns detected</p>
          ) : (
            <ul className="space-y-2">
              {account.flagReasons.map((reason, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <span className="text-red-600 dark:text-red-400 mt-0.5">•</span>
                  {reason}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
          <div className="space-y-4">
            {account.comments.slice(0, 10).map(comment => (
              <div
                key={comment.id}
                className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 py-2"
              >
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                  {new Date(comment.createdAt).toLocaleString()}
                </div>
                <div className="text-sm line-clamp-3">{comment.content}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Analysis History</h2>
          <div className="space-y-3">
            {account.analyses.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400">No analyses yet</p>
            ) : (
              account.analyses.map(result => (
                <div
                  key={result.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <div>
                    <div className="font-medium text-sm">
                      {result.analysis.repository.fullName}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {new Date(result.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <RiskBadge level={getRiskLevel(result.riskScore)} score={result.riskScore} />
                    <Link
                      href={`/dashboard/analysis/${result.analysisId}`}
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
