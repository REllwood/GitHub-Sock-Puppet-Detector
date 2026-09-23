import type { Alert } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getRiskLevel } from '@/lib/detection/risk-scorer';
import type { AccountRiskAnalysis, RiskLevel } from '@/types/analysis';

const LEVEL_ORDER: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };

const ALERT_MIN_LEVEL: RiskLevel = 'high';

/**
 * Raise an alert for accounts that reach high or critical risk. Accounts are only
 * alerted on again if their risk level escalates beyond what was previously reported
 * for the repository (including dismissed alerts), so repeat analyses don't spam.
 */
export async function createAlertsForAnalysis(
  repositoryId: string,
  accountAnalyses: AccountRiskAnalysis[]
): Promise<Alert | null> {
  const flagged = accountAnalyses
    .map(analysis => ({ analysis, level: getRiskLevel(analysis.riskScore) }))
    .filter(({ level }) => LEVEL_ORDER[level] >= LEVEL_ORDER[ALERT_MIN_LEVEL]);

  if (flagged.length === 0) return null;

  const previousAlerts = await prisma.alert.findMany({
    where: { repositoryId },
    select: { severity: true, accountsInvolved: true },
  });

  const previouslyReported = new Map<string, number>();
  for (const alert of previousAlerts) {
    const severity = LEVEL_ORDER[alert.severity as RiskLevel] ?? 0;
    for (const accountId of alert.accountsInvolved) {
      previouslyReported.set(
        accountId,
        Math.max(previouslyReported.get(accountId) ?? -1, severity)
      );
    }
  }

  const newlyFlagged = flagged
    .filter(
      ({ analysis, level }) =>
        (previouslyReported.get(analysis.accountId) ?? -1) < LEVEL_ORDER[level]
    )
    .sort((a, b) => b.analysis.riskScore - a.analysis.riskScore);

  if (newlyFlagged.length === 0) return null;

  const severity = newlyFlagged[0].level;
  const title =
    newlyFlagged.length === 1
      ? `Suspicious account detected: ${newlyFlagged[0].analysis.username}`
      : `${newlyFlagged.length} suspicious accounts detected`;

  const description = newlyFlagged
    .map(({ analysis, level }) => {
      const reasons = analysis.flagReasons.length > 0 ? analysis.flagReasons.join('; ') : 'n/a';
      return `${analysis.username} - risk ${analysis.riskScore.toFixed(0)} (${level}): ${reasons}`;
    })
    .join('\n');

  return prisma.alert.create({
    data: {
      repositoryId,
      severity,
      title,
      description,
      accountsInvolved: newlyFlagged.map(({ analysis }) => analysis.accountId),
    },
  });
}
