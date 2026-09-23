import { DetectionResult } from '@/types/analysis';

// Common first names for pattern matching (subset)
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

const GENERIC_WORDS = ['user', 'test', 'admin', 'developer', 'account', 'temp', 'demo', 'guest'];

/**
 * Detect suspicious naming patterns based on the XZ attack (e.g. "JiaT75").
 * Username patterns are weak evidence on their own - plenty of genuine users have digits in
 * their names - so scores here are deliberately modest and don't stack overlapping rules.
 */
export function detectNamePattern(username: string): DetectionResult {
  const lower = username.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  const wordDigits = lower.match(/^([a-z]+)(\d{2,6})$/);

  if (wordDigits) {
    const [, word] = wordDigits;

    if (GENERIC_WORDS.some(generic => word.startsWith(generic))) {
      // e.g. "user123", "test4567"
      score = 70;
      reasons.push('Generic username followed by digits');
    } else if (COMMON_FIRST_NAMES.includes(word)) {
      // e.g. "jigar123", "dennis4545"
      score = 45;
      reasons.push('Common first name followed by digits');
    } else {
      // e.g. "JiaT75"
      score = 35;
      reasons.push('Word followed by digits');
    }

    // Four digits between 1940 and the current year read as a birth or graduation year
    const digits = Number(wordDigits[2]);
    if (wordDigits[2].length === 4 && digits >= 1940 && digits <= new Date().getFullYear()) {
      score = Math.max(0, score - 15);
      reasons.push('Digits look like a year');
    }
  }

  // Repeating digits, e.g. "bob111"
  if (/(\d)\1{2,}$/.test(lower)) {
    score += 10;
    reasons.push('Ends in repeating digits');
  }

  // Long runs of consonants suggest a randomly generated name, e.g. "xkqjzvbw"
  if (/[bcdfghjklmnpqrstvwxz]{6,}/.test(lower)) {
    score += 30;
    reasons.push('Username looks randomly generated');
  }

  score = Math.min(100, score);

  return {
    detected: score > 30,
    score,
    reason: score > 0 ? reasons.join('; ') : undefined,
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
    .filter(([, accounts]) => accounts.length >= 2)
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
