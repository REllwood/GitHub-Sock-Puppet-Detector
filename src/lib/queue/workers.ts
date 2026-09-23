import { Worker, Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { createGitHubClient } from '@/lib/github/api-client';
import { getRedisConnectionOptions } from './connection';
import { QUEUE_NAMES, type AnalyzeCommentJob, type AnalyzeRepositoryJob } from './setup';

// Comment analysis processor
async function processCommentAnalysis(job: Job<AnalyzeCommentJob>) {
  console.log(`Processing comment analysis job ${job.id}:`, job.data);

  const { commentId, accountId, installationId } = job.data;

  try {
    // Get comment and account from database
    const [comment, account] = await Promise.all([
      prisma.comment.findUnique({ where: { id: commentId } }),
      prisma.account.findUnique({ where: { id: accountId } }),
    ]);

    if (!comment || !account) {
      throw new Error('Comment or account not found');
    }

    // Create GitHub client
    const githubClient = await createGitHubClient(installationId);

    // Fetch latest user data from GitHub
    const userData = await githubClient.getUser(account.username);

    // Update account profile data
    await prisma.account.update({
      where: { id: accountId },
      data: {
        profileData: userData,
        email: userData.email || account.email,
        lastAnalysedAt: new Date(),
      },
    });

    console.log(`Updated profile for account ${account.username}`);

    // TODO: Run detection algorithms
    // This will be implemented in the detection-algorithms todo

    return { success: true, accountId };
  } catch (error) {
    console.error(`Failed to analyze comment ${commentId}:`, error);
    throw error;
  }
}

// Repository analysis processor
async function processRepositoryAnalysis(job: Job<AnalyzeRepositoryJob>) {
  console.log(`Processing repository analysis job ${job.id}:`, job.data);

  const { repositoryId, triggeredBy } = job.data;

  try {
    // Get repository from database
    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
      include: {
        analyses: {
          where: { status: 'processing' },
          take: 1,
        },
      },
    });

    if (!repository) {
      throw new Error('Repository not found');
    }

    // Check if there's already an analysis in progress
    if (repository.analyses.length > 0) {
      console.log(`Analysis already in progress for repository ${repository.fullName}`);
      return { success: true, skipped: true };
    }

    // Create analysis record
    const analysis = await prisma.analysis.create({
      data: {
        repositoryId,
        triggeredBy,
        status: 'processing',
      },
    });

    // Get recent comments for this repository
    const comments = await prisma.comment.findMany({
      where: { repositoryId },
      include: { account: true },
      orderBy: { createdAt: 'desc' },
      take: 1000, // Analyze last 1000 comments
    });

    console.log(`Analyzing ${comments.length} comments for repository ${repository.fullName}`);

    // TODO: Run comprehensive analysis on all comments
    // This will be implemented in the detection-algorithms todo

    // Update analysis status
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });

    console.log(`Completed analysis ${analysis.id} for repository ${repository.fullName}`);

    return { success: true, analysisId: analysis.id, commentsAnalyzed: comments.length };
  } catch (error) {
    console.error(`Failed to analyze repository ${repositoryId}:`, error);

    // Update analysis status to failed if it exists
    const analysis = await prisma.analysis.findFirst({
      where: { repositoryId, status: 'processing' },
    });

    if (analysis) {
      await prisma.analysis.update({
        where: { id: analysis.id },
        data: {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          completedAt: new Date(),
        },
      });
    }

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
    { connection: getRedisConnectionOptions() }
  );

  const repositoryAnalysisWorker = new Worker<AnalyzeRepositoryJob>(
    QUEUE_NAMES.ANALYZE_REPOSITORY,
    processRepositoryAnalysis,
    { connection: getRedisConnectionOptions() }
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
