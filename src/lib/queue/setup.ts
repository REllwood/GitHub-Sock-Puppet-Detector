import { Queue, type DefaultJobOptions } from 'bullmq';
import { getRedisConnectionOptions } from './connection';

// Job types
export interface AnalyzeCommentJob {
  commentId: string;
  accountId: string;
  repositoryId: string;
  installationId: number;
}

export interface AnalyzeRepositoryJob {
  repositoryId: string;
  triggeredBy: 'webhook' | 'manual';
  // Set for manual analyses (created up front so the UI can link to it) and on retries
  analysisId?: string;
}

// Queue names
export const QUEUE_NAMES = {
  ANALYZE_COMMENT: 'analyze-comment',
  ANALYZE_REPOSITORY: 'analyze-repository',
} as const;

const defaultJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

/**
 * Webhook-triggered analyses are debounced: all comments on a repository within the same
 * window are covered by a single analysis that runs when the window closes.
 */
export function getAnalysisDebounceMs(): number {
  const value = Number(process.env.ANALYSIS_DEBOUNCE_MS);
  return Number.isFinite(value) && value > 0 ? value : 60_000;
}

// Queues are created lazily so that importing this module never opens a Redis connection,
// and cached on globalThis so Next.js hot reloads don't leak connections.
const globalForQueues = globalThis as unknown as {
  commentAnalysisQueue?: Queue<AnalyzeCommentJob>;
  repositoryAnalysisQueue?: Queue<AnalyzeRepositoryJob>;
};

export function getCommentAnalysisQueue(): Queue<AnalyzeCommentJob> {
  globalForQueues.commentAnalysisQueue ??= new Queue<AnalyzeCommentJob>(
    QUEUE_NAMES.ANALYZE_COMMENT,
    { connection: getRedisConnectionOptions(), defaultJobOptions }
  );
  return globalForQueues.commentAnalysisQueue;
}

export function getRepositoryAnalysisQueue(): Queue<AnalyzeRepositoryJob> {
  globalForQueues.repositoryAnalysisQueue ??= new Queue<AnalyzeRepositoryJob>(
    QUEUE_NAMES.ANALYZE_REPOSITORY,
    { connection: getRedisConnectionOptions(), defaultJobOptions }
  );
  return globalForQueues.repositoryAnalysisQueue;
}

// Helper functions
export async function queueCommentAnalysis(data: AnalyzeCommentJob) {
  const job = await getCommentAnalysisQueue().add(QUEUE_NAMES.ANALYZE_COMMENT, data);
  console.log(`Queued comment analysis job: ${job.id}`);
  return job;
}

/**
 * Queue an analysis that has already been created (manual trigger)
 */
export async function queueRepositoryAnalysis(data: AnalyzeRepositoryJob & { analysisId: string }) {
  const job = await getRepositoryAnalysisQueue().add(QUEUE_NAMES.ANALYZE_REPOSITORY, data, {
    jobId: `manual-${data.analysisId}`,
  });
  console.log(`Queued repository analysis job: ${job.id}`);
  return job;
}

/**
 * Schedule a debounced, webhook-triggered analysis of a repository
 */
export async function scheduleRepositoryAnalysis(repositoryId: string, now: number = Date.now()) {
  const debounceMs = getAnalysisDebounceMs();
  const window = Math.floor(now / debounceMs);
  const runAt = (window + 1) * debounceMs;

  const job = await getRepositoryAnalysisQueue().add(
    QUEUE_NAMES.ANALYZE_REPOSITORY,
    { repositoryId, triggeredBy: 'webhook' },
    { jobId: `repo-${repositoryId}-${window}`, delay: runAt - now }
  );
  console.log(`Scheduled repository analysis job: ${job.id}`);
  return job;
}

// Get queue statistics
export async function getQueueStats() {
  const [commentCounts, repoCounts] = await Promise.all([
    getCommentAnalysisQueue().getJobCounts(),
    getRepositoryAnalysisQueue().getJobCounts(),
  ]);

  return {
    commentAnalysis: commentCounts,
    repositoryAnalysis: repoCounts,
  };
}

// Graceful shutdown
export async function closeQueues() {
  await Promise.all([
    globalForQueues.commentAnalysisQueue?.close(),
    globalForQueues.repositoryAnalysisQueue?.close(),
  ]);
  globalForQueues.commentAnalysisQueue = undefined;
  globalForQueues.repositoryAnalysisQueue = undefined;
  console.log('Queues closed');
}
