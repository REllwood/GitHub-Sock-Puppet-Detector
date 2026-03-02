import { DetectionResult } from '@/types/analysis';

// Common first names for pattern matching (subset for demo)
const COMMON_FIRST_NAMES = [
  'james',
  'john',
  'robert',
  'michael',
  'william',
  'david',
  'richard',
  'joseph',
  'thomas',
  'charles',
  'mary',
  'patricia',
  'jennifer',
  'linda',
  'barbara',
  'elizabeth',
  'susan',
  'jessica',
  'sarah',
  'karen',
  'jigar',
  'dennis',
  'hans',
];

/**
 * Detect suspicious naming patterns based on XZ attack
 * Patterns: firstname+digits, lowercase+digits, etc.
 */
export function detectNamePattern(username: string): DetectionResult {
  const lower = username.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  // Pattern 1: Common first name + 2-6 digits (e.g., "jigar123", "dennis4545")
  const firstNameDigitsPattern = /^[a-z]+\d{2,6}$/;
  if (firstNameDigitsPattern.test(lower)) {
    const name = lower.replace(/\d+$/, '');
    if (COMMON_FIRST_NAMES.includes(name)) {
      score += 60;
      reasons.push('Common first name followed by digits');
    } else {
      score += 30;
      reasons.push('Word followed by digits');
    }
  }

  // Pattern 2: Capitalized name + digits (e.g., "James123")
  const capitalizedNameDigitsPattern = /^[A-Z][a-z]+\d{2,6}$/;
  if (capitalizedNameDigitsPattern.test(username)) {
    score += 40;
    reasons.push('Capitalized name followed by digits');
  }

  // Pattern 3: All lowercase + exactly 4 digits (common pattern)
  const fourDigitPattern = /^[a-z]+\d{4}$/;
  if (fourDigitPattern.test(lower)) {
    score += 35;
    reasons.push('Lowercase word with exactly 4 digits');
  }

  // Pattern 4: Name ending in sequential digits (e.g., "user123")
  const sequentialPattern = /(\d)\1{2,}$/;
  if (sequentialPattern.test(username)) {
    score += 25;
    reasons.push('Contains repeating sequential digits');
  }

  // Pattern 5: Very generic patterns like "user123", "test456"
  const genericWords = ['user', 'test', 'admin', 'developer', 'account', 'temp', 'demo'];
  const startsWithGeneric = genericWords.some(word => lower.startsWith(word));
  if (startsWithGeneric && /\d+$/.test(lower)) {
    score += 50;
    reasons.push('Generic username followed by digits');
  }

  // Cap score at 100
  score = Math.min(100, score);

  return {
    detected: score > 30,
    score,
    reason: reasons.length > 0 ? reasons.join('; ') : undefined,
    details: {
      username,
      patterns: reasons,
    },
  };
}

/**
 * Detect similar naming patterns across multiple accounts
 */
export function detectSimilarNamingPatterns(usernames: string[]): {
  clusters: Array<{
    pattern: string;
    accounts: string[];
    score: number;
  }>;
  overallScore: number;
} {
  const clusters: Map<string, string[]> = new Map();

  usernames.forEach(username => {
    const lower = username.toLowerCase();

    // Extract base name (without digits)
    const baseName = lower.replace(/\d+$/, '');
    if (baseName.length > 0 && baseName !== lower) {
      const key = `base:${baseName}`;
      if (!clusters.has(key)) {
        clusters.set(key, []);
      }
      clusters.get(key)!.push(username);
    }

    // Check for N-digit patterns
    const digitMatch = username.match(/\d+$/);
    if (digitMatch) {
      const digitCount = digitMatch[0].length;
      const key = `digits:${digitCount}`;
      if (!clusters.has(key)) {
        clusters.set(key, []);
      }
      clusters.get(key)!.push(username);
    }
  });

  const results = Array.from(clusters.entries())
    .filter(([_, accounts]) => accounts.length >= 2)
    .map(([pattern, accounts]) => {
      // Score based on cluster size
      const score = Math.min(100, 30 + accounts.length * 15);
      return {
        pattern,
        accounts,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);

  const overallScore = results.length > 0 ? Math.max(...results.map(r => r.score)) : 0;

  return {
    clusters: results,
    overallScore,
  };
}
