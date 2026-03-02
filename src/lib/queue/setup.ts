import { Queue, QueueEvents } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Connection configuration
const connection = {
  host: 'localhost',
  port: 6379,
};

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

// Create queues
export const commentAnalysisQueue = new Queue<AnalyzeCommentJob>(QUEUE_NAMES.ANALYZE_COMMENT, connection);

export const repositoryAnalysisQueue = new Queue<AnalyzeRepositoryJob>(
  QUEUE_NAMES.ANALYZE_REPOSITORY,
  connection
);

// Queue events for monitoring
export const commentQueueEvents = new QueueEvents(QUEUE_NAMES.ANALYZE_COMMENT, connection);
export const repositoryQueueEvents = new QueueEvents(QUEUE_NAMES.ANALYZE_REPOSITORY, connection);

// Helper functions
export async function queueCommentAnalysis(data: AnalyzeCommentJob) {
  const job = await commentAnalysisQueue.add('analyze-comment', data);
  console.log(`Queued comment analysis job: ${job.id}`);
  return job;
}

export async function queueRepositoryAnalysis(data: AnalyzeRepositoryJob) {
  const job = await repositoryAnalysisQueue.add('analyze-repository', data);
  console.log(`Queued repository analysis job: ${job.id}`);
  return job;
}

// Get queue statistics
export async function getQueueStats() {
  const [commentCounts, repoCounts] = await Promise.all([
    commentAnalysisQueue.getJobCounts(),
    repositoryAnalysisQueue.getJobCounts(),
  ]);

  return {
    commentAnalysis: commentCounts,
    repositoryAnalysis: repoCounts,
  };
}

// Graceful shutdown
export async function closeQueues() {
  await Promise.all([
    commentAnalysisQueue.close(),
    repositoryAnalysisQueue.close(),
    commentQueueEvents.close(),
    repositoryQueueEvents.close(),
  ]);
  console.log('Queues closed');
}

// Handle process termination
if (typeof process !== 'undefined') {
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing queues...');
    await closeQueues();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, closing queues...');
    await closeQueues();
    process.exit(0);
  });
}
