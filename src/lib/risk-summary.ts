import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { generateFlagReasons, getRiskLevel } from '@/lib/detection/risk-scorer';
import type { AccountDetections, RiskLevel } from '@/types/analysis';

/**
 * An account's risk as seen by a viewer: taken from the latest completed analysis of each
 * repository the viewer can access (never from repositories they can't see).
 */
export async function getScopedAccountRisk(
  accountId: string,
  repositoryFilter: Prisma.RepositoryWhereInput
) {
  const results = await prisma.accountAnalysis.findMany({
    where: {
      accountId,
      analysis: { status: 'completed', repository: repositoryFilter },
    },
    include: { analysis: { include: { repository: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const latestByRepository = new Map<string, (typeof results)[number]>();
  for (const result of results) {
    if (!latestByRepository.has(result.analysis.repositoryId)) {
      latestByRepository.set(result.analysis.repositoryId, result);
    }
  }

  const latest = Array.from(latestByRepository.values()).sort((a, b) => b.riskScore - a.riskScore);
  const top = latest[0];

  return {
    riskScore: top?.riskScore ?? 0,
    flagReasons: top ? generateFlagReasons(top.detections as unknown as AccountDetections) : [],
    detections: (top?.detections as unknown as AccountDetections | undefined) ?? null,
    latestByRepository: latest,
    history: results,
  };
}

/**
 * Risk distribution across accounts in the viewer's repositories, using each repository's
 * latest completed analysis (an account's highest score across repositories counts).
 */
export async function getScopedRiskDistribution(repositoryFilter: Prisma.RepositoryWhereInput) {
  const repositories = await prisma.repository.findMany({
    where: repositoryFilter,
    select: {
      analyses: {
        where: { status: 'completed' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { accountResults: { select: { accountId: true, riskScore: true } } },
      },
    },
  });

  const highest = new Map<string, number>();
  for (const repository of repositories) {
    for (const result of repository.analyses[0]?.accountResults ?? []) {
      highest.set(result.accountId, Math.max(highest.get(result.accountId) ?? 0, result.riskScore));
    }
  }

  const distribution: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  highest.forEach(score => {
    distribution[getRiskLevel(score)]++;
  });

  return { distribution, totalAccounts: highest.size };
}
