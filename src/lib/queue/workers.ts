import { Worker, Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { markAnalysisFailed, runRepositoryAnalysis, startAnalysis } from '@/lib/analysis/run';
import { createGitHubClient } from '@/lib/github/api-client';
import { needsProfileSync, syncAccountProfile } from '@/lib/github/profile-sync';
import { getRedisConnectionOptions } from './connection';
import {
  QUEUE_NAMES,
  scheduleRepositoryAnalysis,
  type AnalyzeCommentJob,
  type AnalyzeRepositoryJob,
} from './setup';

/**
 * New comment: sync the author's GitHub profile if needed, then schedule a
 * (debounced) analysis of the repository.
 */
export async function processCommentAnalysis(job: Job<AnalyzeCommentJob>) {
  const { commentId, installationId } = job.data;

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: { account: true },
  });

  if (!comment) {
    return { skipped: 'Comment no longer exists' };
  }

  let profile: 'synced' | 'not_found' | 'fresh' = 'fresh';
  if (needsProfileSync(comment.account)) {
    const client = await createGitHubClient(installationId);
    profile = await syncAccountProfile(client, comment.account);
  }

  await scheduleRepositoryAnalysis(comment.repositoryId);

  return { accountId: comment.accountId, profile };
}

/**
 * Repository analysis: backfill, profile sync, detection, results and alerts
 */
export async function processRepositoryAnalysis(job: Job<AnalyzeRepositoryJob>) {
  const repository = await prisma.repository.findUnique({
    where: { id: job.data.repositoryId },
    select: { id: true },
  });

  if (!repository) {
    return { skipped: 'Repository no longer exists' };
  }

  const analysis = await startAnalysis(job.data);

  // Retries reuse the same analysis record
  if (!job.data.analysisId) {
    await job.updateData({ ...job.data, analysisId: analysis.id });
  }

  try {
    return await runRepositoryAnalysis({ ...job.data, analysisId: analysis.id });
  } catch (error) {
    console.error(`Analysis ${analysis.id} failed:`, error);
    await markAnalysisFailed(analysis.id, error);
    throw error;
  }
}

let workers: Worker[] = [];

/**
 * Start the queue workers. Call once from the worker process entry point.
 */
export function startWorkers(): Worker[] {
  if (workers.length > 0) return workers;

  const commentAnalysisWorker = new Worker<AnalyzeCommentJob>(
    QUEUE_NAMES.ANALYZE_COMMENT,
    processCommentAnalysis,
    { connection: getRedisConnectionOptions(), concurrency: 5 }
  );

  const repositoryAnalysisWorker = new Worker<AnalyzeRepositoryJob>(
    QUEUE_NAMES.ANALYZE_REPOSITORY,
    processRepositoryAnalysis,
    { connection: getRedisConnectionOptions(), concurrency: 2 }
  );

  commentAnalysisWorker.on('completed', job => {
    console.log(`Comment analysis job ${job.id} completed`);
  });

  commentAnalysisWorker.on('failed', (job, err) => {
    console.error(`Comment analysis job ${job?.id} failed:`, err);
  });

  repositoryAnalysisWorker.on('completed', job => {
    console.log(`Repository analysis job ${job.id} completed`);
  });

  repositoryAnalysisWorker.on('failed', (job, err) => {
    console.error(`Repository analysis job ${job?.id} failed:`, err);
  });

  workers = [commentAnalysisWorker, repositoryAnalysisWorker];
  return workers;
}

// Graceful shutdown
export async function closeWorkers() {
  await Promise.all(workers.map(worker => worker.close()));
  workers = [];
  console.log('Workers closed');
}
