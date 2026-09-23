import { DetectionResult } from '@/types/analysis';

const DEFAULT_AGE_THRESHOLD_DAYS = 90;

export function formatDays(days: number): string {
  return `${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Age of a GitHub account in whole days, or null if the creation date isn't known yet
 */
export function getAccountAgeInDays(accountCreatedAt: Date | null, now: Date = new Date()) {
  if (!accountCreatedAt) return null;
  return Math.floor((now.getTime() - accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Detect accounts based on their age at a reference point in time - normally the account's
 * first comment in the repository, so an account created days before joining a campaign
 * still stands out months later. Newer accounts receive higher suspicion scores.
 */
export function detectAccountAge(
  accountCreatedAt: Date | null,
  thresholdDays: number = DEFAULT_AGE_THRESHOLD_DAYS,
  firstCommentAt?: Date
): DetectionResult {
  const referenceDate = firstCommentAt ?? new Date();

  if (!accountCreatedAt) {
    return {
      detected: false,
      score: 0,
      evaluated: false,
      reason: 'Account creation date not yet known',
    };
  }

  const ageInDays = Math.floor(
    (referenceDate.getTime() - accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
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
    reason: detected
      ? firstCommentAt
        ? `Account was ${formatDays(ageInDays)} old when it first commented`
        : `Account is ${formatDays(ageInDays)} old`
      : undefined,
    details: {
      ageInDays,
      createdAt: accountCreatedAt.toISOString(),
      referenceDate: referenceDate.toISOString(),
      thresholdDays,
    },
  };
}

/**
 * Batch analyze account ages
 */
export function detectAccountAgesBatch(
  accounts: Array<{ createdAt: Date | null }>,
  thresholdDays?: number
): Map<number, DetectionResult> {
  const results = new Map<number, DetectionResult>();

  accounts.forEach((account, index) => {
    results.set(index, detectAccountAge(account.createdAt, thresholdDays));
  });

  return results;
}
