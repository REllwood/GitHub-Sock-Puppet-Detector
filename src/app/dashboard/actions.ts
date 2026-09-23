'use server';

import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requestRepositoryAnalysis } from '@/lib/analysis/service';
import { checkRateLimit } from '@/lib/rate-limit';
import { requireViewer } from '@/lib/viewer';

/**
 * Start a manual analysis of a repository and go to its results page
 */
export async function analyseRepositoryAction(repositoryId: string) {
  const { viewer, repositoryFilter } = await requireViewer('/dashboard/repositories');

  const repository = await prisma.repository.findFirst({
    where: { id: repositoryId, ...repositoryFilter },
    select: { id: true },
  });
  if (!repository) notFound();

  const rateLimit = await checkRateLimit(`user:${viewer.login.toLowerCase()}`);
  if (!rateLimit.allowed) {
    throw new Error('Too many requests - please try again later');
  }

  const { analysis } = await requestRepositoryAnalysis(repository.id);

  revalidatePath('/dashboard', 'layout');
  redirect(`/dashboard/analysis/${analysis.id}`);
}

/**
 * Dismiss an alert
 */
export async function dismissAlertAction(alertId: string) {
  const { viewer, repositoryFilter } = await requireViewer('/dashboard/alerts');

  const { count } = await prisma.alert.updateMany({
    where: { id: alertId, dismissed: false, repository: repositoryFilter },
    data: { dismissed: true, dismissedAt: new Date(), dismissedBy: viewer.login },
  });
  if (count === 0) notFound();

  revalidatePath('/dashboard', 'layout');
}
