import type { Analysis } from '@prisma/client';
import { prisma } from '@/lib/db';
import { queueRepositoryAnalysis } from '@/lib/queue/setup';

// An analysis still pending/processing after this long is assumed lost (e.g. worker crash)
export const STALE_ANALYSIS_MS = 30 * 60 * 1000;

/**
 * Mark analyses that have been pending or processing for too long as failed
 */
export async function failStaleAnalyses(repositoryId: string, now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - STALE_ANALYSIS_MS);

  await prisma.analysis.updateMany({
    where: {
      repositoryId,
      status: { in: ['pending', 'processing'] },
      OR: [{ startedAt: { lt: cutoff } }, { startedAt: null, createdAt: { lt: cutoff } }],
    },
    data: {
      status: 'failed',
      errorMessage: 'Analysis timed out',
      completedAt: now,
    },
  });
}

/**
 * Request a manual analysis of a repository. Returns the in-progress analysis instead
 * if one is already running.
 */
export async function requestRepositoryAnalysis(
  repositoryId: string
): Promise<{ analysis: Analysis; alreadyRunning: boolean }> {
  await failStaleAnalyses(repositoryId);

  const existing = await prisma.analysis.findFirst({
    where: { repositoryId, status: { in: ['pending', 'processing'] } },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    return { analysis: existing, alreadyRunning: true };
  }

  const analysis = await prisma.analysis.create({
    data: { repositoryId, triggeredBy: 'manual', status: 'pending' },
  });

  try {
    await queueRepositoryAnalysis({
      repositoryId,
      triggeredBy: 'manual',
      analysisId: analysis.id,
    });
  } catch (error) {
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: {
        status: 'failed',
        errorMessage: 'Could not queue analysis',
        completedAt: new Date(),
      },
    });
    throw error;
  }

  return { analysis, alreadyRunning: false };
}
