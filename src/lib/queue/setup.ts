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
  installationId: number;
  triggeredBy: 'webhook' | 'manual';
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

export async function queueRepositoryAnalysis(data: AnalyzeRepositoryJob) {
  const job = await getRepositoryAnalysisQueue().add(QUEUE_NAMES.ANALYZE_REPOSITORY, data);
  console.log(`Queued repository analysis job: ${job.id}`);
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
