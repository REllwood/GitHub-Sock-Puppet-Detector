import type {
  AccountDetections,
  AccountRiskAnalysis,
  DetectionResult,
  RiskLevel,
} from '@/types/analysis';

/**
 * Relative weight of each detector. The risk score is the weighted average of the detectors
 * that ran, so the LLM weight only applies when LLM analysis is enabled and succeeded.
 */
const DETECTION_WEIGHTS: Record<keyof AccountDetections, number> = {
  accountAge: 0.2,
  namePattern: 0.1,
  emailPattern: 0.1,
  singleRepo: 0.1,
  coordinatedBehaviour: 0.3,
  temporalClustering: 0.2,
  llmAnalysis: 0.2,
};

/**
 * Risk level ranges (inclusive upper bounds)
 */
const RISK_THRESHOLDS = {
  low: { min: 0, max: 30 },
  medium: { min: 31, max: 60 },
  high: { min: 61, max: 85 },
  critical: { min: 86, max: 100 },
} as const;

const FLAG_LABELS: Record<keyof AccountDetections, string> = {
  accountAge: 'Age',
  namePattern: 'Name',
  emailPattern: 'Email',
  singleRepo: 'Activity',
  coordinatedBehaviour: 'Coordination',
  temporalClustering: 'Temporal',
  llmAnalysis: 'LLM',
};

function presentDetections(detections: AccountDetections) {
  return (Object.keys(DETECTION_WEIGHTS) as Array<keyof AccountDetections>)
    .map(key => [key, detections[key]] as const)
    .filter(
      (entry): entry is readonly [keyof AccountDetections, DetectionResult] =>
        Boolean(entry[1]) && entry[1]?.evaluated !== false
    );
}

/**
 * Calculate weighted risk score (0 - 100) from detection results. Detectors that had no
 * data to evaluate (e.g. no public email) are left out rather than counted as zero.
 */
export function calculateRiskScore(detections: AccountDetections): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [key, detection] of presentDetections(detections)) {
    const score = Math.max(0, Math.min(100, detection.score));
    weightedSum += score * DETECTION_WEIGHTS[key];
    totalWeight += DETECTION_WEIGHTS[key];
  }

  if (totalWeight === 0) return 0;

  return Math.max(0, Math.min(100, weightedSum / totalWeight));
}

/**
 * Determine risk level from score
 */
export function getRiskLevel(score: number): RiskLevel {
  if (score > RISK_THRESHOLDS.high.max) {
    return 'critical';
  } else if (score > RISK_THRESHOLDS.medium.max) {
    return 'high';
  } else if (score > RISK_THRESHOLDS.low.max) {
    return 'medium';
  } else {
    return 'low';
  }
}

/**
 * Get color for risk level (for UI)
 */
export function getRiskColor(level: RiskLevel): string {
  switch (level) {
    case 'low':
      return 'green';
    case 'medium':
      return 'yellow';
    case 'high':
      return 'orange';
    case 'critical':
      return 'red';
  }
}

/**
 * Generate flag reasons from detection results
 */
export function generateFlagReasons(detections: AccountDetections): string[] {
  return presentDetections(detections)
    .filter(([, detection]) => detection.detected && detection.reason)
    .map(([key, detection]) => `${FLAG_LABELS[key]}: ${detection.reason}`);
}

/**
 * Create complete account risk analysis
 */
export function createAccountRiskAnalysis(
  accountId: string,
  username: string,
  detections: AccountDetections
): AccountRiskAnalysis {
  const riskScore = calculateRiskScore(detections);
  const flagReasons = generateFlagReasons(detections);

  return {
    accountId,
    username,
    riskScore,
    detections,
    flagReasons,
  };
}

/**
 * Get risk summary statistics
 */
export function getRiskSummary(analyses: AccountRiskAnalysis[]): {
  total: number;
  byLevel: Record<RiskLevel, number>;
  averageScore: number;
  highestScore: number;
  criticalAccounts: string[];
} {
  const byLevel: Record<RiskLevel, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  let totalScore = 0;
  let highestScore = 0;
  const criticalAccounts: string[] = [];

  analyses.forEach(analysis => {
    const level = getRiskLevel(analysis.riskScore);
    byLevel[level]++;
    totalScore += analysis.riskScore;
    highestScore = Math.max(highestScore, analysis.riskScore);

    if (level === 'critical') {
      criticalAccounts.push(analysis.username);
    }
  });

  return {
    total: analyses.length,
    byLevel,
    averageScore: analyses.length > 0 ? totalScore / analyses.length : 0,
    highestScore,
    criticalAccounts,
  };
}

/**
 * Filter accounts by risk level
 */
export function filterByRiskLevel(
  analyses: AccountRiskAnalysis[],
  minLevel: RiskLevel
): AccountRiskAnalysis[] {
  const levelOrder: Record<RiskLevel, number> = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3,
  };

  const minLevelValue = levelOrder[minLevel];

  return analyses.filter(analysis => {
    const level = getRiskLevel(analysis.riskScore);
    return levelOrder[level] >= minLevelValue;
  });
}

/**
 * Sort accounts by risk score (descending)
 */
export function sortByRiskScore(analyses: AccountRiskAnalysis[]): AccountRiskAnalysis[] {
  return [...analyses].sort((a, b) => b.riskScore - a.riskScore);
}

/**
 * Get detection weights (for configuration/display)
 */
export function getDetectionWeights() {
  return { ...DETECTION_WEIGHTS };
}

/**
 * Get risk thresholds (for configuration/display)
 */
export function getRiskThresholds() {
  return { ...RISK_THRESHOLDS };
}
