import { DetectionResult, AccountRiskAnalysis, RiskLevel } from '@/types/analysis';

/**
 * Detection weights for risk calculation
 * Note: LLM weight is optional and will be 0 if LLM analysis is disabled
 */
const DETECTION_WEIGHTS = {
  accountAge: 0.15,
  namePattern: 0.18,
  emailPattern: 0.12,
  singleRepo: 0.08,
  coordinatedBehaviour: 0.25,
  temporalClustering: 0.08,
  llmAnalysis: 0.14, // Optional - only used if enabled
} as const;

/**
 * Risk level thresholds
 */
const RISK_THRESHOLDS = {
  low: { min: 0, max: 30 },
  medium: { min: 31, max: 60 },
  high: { min: 61, max: 85 },
  critical: { min: 86, max: 100 },
} as const;

/**
 * Calculate weighted risk score from detection results
 */
export function calculateRiskScore(detections: {
  accountAge: DetectionResult;
  namePattern: DetectionResult;
  emailPattern: DetectionResult;
  singleRepo: DetectionResult;
  coordinatedBehaviour: DetectionResult;
  temporalClustering: DetectionResult;
  llmAnalysis?: DetectionResult;
}): number {
  // Base score calculation
  let weightedSum =
    detections.accountAge.score * DETECTION_WEIGHTS.accountAge +
    detections.namePattern.score * DETECTION_WEIGHTS.namePattern +
    detections.emailPattern.score * DETECTION_WEIGHTS.emailPattern +
    detections.singleRepo.score * DETECTION_WEIGHTS.singleRepo +
    detections.coordinatedBehaviour.score * DETECTION_WEIGHTS.coordinatedBehaviour +
    detections.temporalClustering.score * DETECTION_WEIGHTS.temporalClustering;

  // Add LLM score if available
  if (detections.llmAnalysis && detections.llmAnalysis.score > 0) {
    weightedSum += detections.llmAnalysis.score * DETECTION_WEIGHTS.llmAnalysis;
    
    // Normalize to account for the extra weight
    weightedSum = (weightedSum / 1.14) * 1.0; // Adjust for the new total weight
  }

  // Ensure score is between 0 and 100
  return Math.max(0, Math.min(100, weightedSum));
}

/**
 * Determine risk level from score
 */
export function getRiskLevel(score: number): RiskLevel {
  if (score >= RISK_THRESHOLDS.critical.min) {
    return 'critical';
  } else if (score >= RISK_THRESHOLDS.high.min) {
    return 'high';
  } else if (score >= RISK_THRESHOLDS.medium.min) {
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
export function generateFlagReasons(detections: {
  accountAge: DetectionResult;
  namePattern: DetectionResult;
  emailPattern: DetectionResult;
  singleRepo: DetectionResult;
  coordinatedBehaviour: DetectionResult;
  temporalClustering: DetectionResult;
}): string[] {
  const reasons: string[] = [];

  if (detections.accountAge.detected && detections.accountAge.reason) {
    reasons.push(`Age: ${detections.accountAge.reason}`);
  }

  if (detections.namePattern.detected && detections.namePattern.reason) {
    reasons.push(`Name: ${detections.namePattern.reason}`);
  }

  if (detections.emailPattern.detected && detections.emailPattern.reason) {
    reasons.push(`Email: ${detections.emailPattern.reason}`);
  }

  if (detections.singleRepo.detected && detections.singleRepo.reason) {
    reasons.push(`Activity: ${detections.singleRepo.reason}`);
  }

  if (detections.coordinatedBehaviour.detected && detections.coordinatedBehaviour.reason) {
    reasons.push(`Coordination: ${detections.coordinatedBehaviour.reason}`);
  }

  if (detections.temporalClustering.detected && detections.temporalClustering.reason) {
    reasons.push(`Temporal: ${detections.temporalClustering.reason}`);
  }

  return reasons;
}

/**
 * Create complete account risk analysis
 */
export function createAccountRiskAnalysis(
  accountId: string,
  username: string,
  detections: {
    accountAge: DetectionResult;
    namePattern: DetectionResult;
    emailPattern: DetectionResult;
    singleRepo: DetectionResult;
    coordinatedBehaviour: DetectionResult;
    temporalClustering: DetectionResult;
  }
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
