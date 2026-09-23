import { prisma } from '@/lib/db';
import { analyzeRepository } from '@/lib/detection/analyzer';
import { createGitHubClient, type GitHubAPIClient } from '@/lib/github/api-client';
import { syncRepositoryComments } from '@/lib/github/comment-sync';
import { needsProfileSync, syncAccountProfile } from '@/lib/github/profile-sync';
import type { AnalyzeRepositoryJob } from '@/lib/queue/setup';
import type { AccountRiskAnalysis } from '@/types/analysis';
import { createAlertsForAnalysis } from './alerts';

// Keeps each run well inside the installation's API rate limit (5,000 requests/hour)
const MAX_PROFILE_SYNCS_PER_RUN = 300;

export interface RunDependencies {
  createClient: (installationId: number) => Promise<GitHubAPIClient>;
}

const defaultDependencies: RunDependencies = {
  createClient: createGitHubClient,
};

export interface RunResult {
  analysisId?: string;
  skipped?: string;
  accountsAnalysed?: number;
  commentsSynced?: number;
  profilesSynced?: number;
  alertId?: string | null;
}

/**
 * Get the analysis record for a job, creating it for webhook-triggered runs
 */
export async function startAnalysis(data: AnalyzeRepositoryJob) {
  const now = new Date();

  if (data.analysisId) {
    return prisma.analysis.update({
      where: { id: data.analysisId },
      data: { status: 'processing', startedAt: now, errorMessage: null, completedAt: null },
    });
  }

  return prisma.analysis.create({
    data: {
      repositoryId: data.repositoryId,
      triggeredBy: data.triggeredBy,
      status: 'processing',
      startedAt: now,
    },
  });
}

export async function markAnalysisFailed(analysisId: string, error: unknown) {
  await prisma.analysis.updateMany({
    where: { id: analysisId },
    data: {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      completedAt: new Date(),
    },
  });
}

/**
 * Sync profiles (creation date, email, recent activity) for the repository's commenters
 * that haven't been synced recently, oldest-synced first.
 */
async function syncRepositoryProfiles(client: GitHubAPIClient, repositoryId: string) {
  const accounts = await prisma.account.findMany({
    where: { comments: { some: { repositoryId } } },
    select: { id: true, githubId: true, username: true, email: true, profileSyncedAt: true },
    orderBy: { profileSyncedAt: { sort: 'asc', nulls: 'first' } },
  });

  const stale = accounts.filter(account => needsProfileSync(account));
  let synced = 0;

  for (const account of stale.slice(0, MAX_PROFILE_SYNCS_PER_RUN)) {
    await syncAccountProfile(client, account);
    synced++;
  }

  return synced;
}

async function saveResults(
  analysisId: string,
  accountAnalyses: AccountRiskAnalysis[],
  clusters: unknown[]
) {
  const completedAt = new Date();

  await prisma.$transaction([
    prisma.accountAnalysis.deleteMany({ where: { analysisId } }),
    prisma.accountAnalysis.createMany({
      data: accountAnalyses.map(analysis => ({
        analysisId,
        accountId: analysis.accountId,
        riskScore: analysis.riskScore,
        detections: JSON.parse(JSON.stringify(analysis.detections)),
      })),
    }),
    ...accountAnalyses.map(analysis =>
      prisma.account.update({
        where: { id: analysis.accountId },
        data: {
          riskScore: analysis.riskScore,
          flagReasons: analysis.flagReasons,
          lastAnalysedAt: completedAt,
        },
      })
    ),
    prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: 'completed',
        completedAt,
        errorMessage: null,
        detectedClusters: JSON.parse(JSON.stringify(clusters)),
      },
    }),
  ]);
}

/**
 * Run a full repository analysis: backfill comments, sync commenter profiles,
 * run the detectors, save the results and raise alerts.
 */
export async function runRepositoryAnalysis(
  data: AnalyzeRepositoryJob & { analysisId: string },
  dependencies: RunDependencies = defaultDependencies
): Promise<RunResult> {
  const repository = await prisma.repository.findUnique({ where: { id: data.repositoryId } });

  if (!repository) {
    return { analysisId: data.analysisId, skipped: 'Repository no longer exists' };
  }

  const client = await dependencies.createClient(repository.installationId);

  let commentsSynced = 0;
  if (data.triggeredBy === 'manual' || !repository.commentsSyncedAt) {
    commentsSynced = await syncRepositoryComments(client, repository);
  }

  const profilesSynced = await syncRepositoryProfiles(client, repository.id);

  const { accountAnalyses, clusters } = await analyzeRepository(repository.id);

  await saveResults(data.analysisId, accountAnalyses, clusters);
  const alert = await createAlertsForAnalysis(repository.id, accountAnalyses);

  console.log(
    `Completed analysis ${data.analysisId} for ${repository.fullName}: ` +
      `${accountAnalyses.length} accounts, ${commentsSynced} comments synced, ` +
      `${profilesSynced} profiles synced${alert ? `, alert ${alert.id} raised` : ''}`
  );

  return {
    analysisId: data.analysisId,
    accountsAnalysed: accountAnalyses.length,
    commentsSynced,
    profilesSynced,
    alertId: alert?.id ?? null,
  };
}
