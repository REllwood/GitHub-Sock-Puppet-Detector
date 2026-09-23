import type { RiskLevel } from '@/types/analysis';

const SEVERITY_ORDER: Record<RiskLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Sort comparator: most severe first
 */
export function bySeverity(a: { severity: string }, b: { severity: string }): number {
  return (
    (SEVERITY_ORDER[a.severity as RiskLevel] ?? 99) -
    (SEVERITY_ORDER[b.severity as RiskLevel] ?? 99)
  );
}

/**
 * Percentage of a total, safe for a zero total
 */
export function percentage(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

export const DETECTOR_LABELS: Record<string, string> = {
  accountAge: 'Account age',
  namePattern: 'Username pattern',
  emailPattern: 'Email pattern',
  singleRepo: 'Activity focus',
  coordinatedBehaviour: 'Coordinated behaviour',
  temporalClustering: 'Newcomer burst',
  llmAnalysis: 'LLM analysis',
};
