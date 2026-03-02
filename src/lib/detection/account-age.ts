import { DetectionResult } from '@/types/analysis';

const DEFAULT_AGE_THRESHOLD_DAYS = 90;

/**
 * Detect accounts based on their age
 * Newer accounts receive higher suspicion scores
 */
export function detectAccountAge(
  accountCreatedAt: Date,
  thresholdDays: number = DEFAULT_AGE_THRESHOLD_DAYS
): DetectionResult {
  const now = new Date();
  const ageInDays = Math.floor(
    (now.getTime() - accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (ageInDays < 0) {
    return {
      detected: false,
      score: 0,
      reason: 'Invalid account creation date',
    };
  }

  // Calculate score: newer accounts get higher scores
  let score = 0;
  let detected = false;

  if (ageInDays <= 7) {
    score = 100;
    detected = true;
  } else if (ageInDays <= 30) {
    score = 80;
    detected = true;
  } else if (ageInDays <= thresholdDays) {
    score = Math.max(0, 60 - ((ageInDays - 30) / (thresholdDays - 30)) * 60);
    detected = true;
  } else {
    score = 0;
    detected = false;
  }

  return {
    detected,
    score,
    reason: detected ? `Account is ${ageInDays} days old` : undefined,
    details: {
      ageInDays,
      createdAt: accountCreatedAt.toISOString(),
      thresholdDays,
    },
  };
}

/**
 * Batch analyze account ages
 */
export function detectAccountAgesBatch(
  accounts: Array<{ createdAt: Date }>,
  thresholdDays?: number
): Map<number, DetectionResult> {
  const results = new Map<number, DetectionResult>();

  accounts.forEach((account, index) => {
    results.set(index, detectAccountAge(account.createdAt, thresholdDays));
  });

  return results;
}
