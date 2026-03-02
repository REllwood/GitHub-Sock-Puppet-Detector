import { DetectionResult } from '@/types/analysis';

// Known disposable email providers
const DISPOSABLE_EMAIL_PROVIDERS = [
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'throwaway.email',
  'temp-mail.org',
  'fakeinbox.com',
];

/**
 * Extract email domain from email address
 */
function extractDomain(email: string): string | null {
  const match = email.match(/@(.+)$/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Detect suspicious email patterns for a single account
 */
export function detectEmailPattern(email: string | null): DetectionResult {
  if (!email) {
    return {
      detected: false,
      score: 0,
      details: { hasEmail: false },
    };
  }

  let score = 0;
  const reasons: string[] = [];
  const domain = extractDomain(email);

  if (!domain) {
    return {
      detected: false,
      score: 0,
      reason: 'Invalid email format',
    };
  }

  // Check for disposable email providers
  if (DISPOSABLE_EMAIL_PROVIDERS.includes(domain)) {
    score += 80;
    reasons.push('Uses disposable email provider');
  }

  // Check for suspicious patterns in email prefix
  const prefix = email.split('@')[0].toLowerCase();

  // Pattern 1: Prefix follows same pattern as username issues (e.g., name+digits)
  if (/^[a-z]+\d{2,6}$/.test(prefix)) {
    score += 30;
    reasons.push('Email prefix follows suspicious pattern (name+digits)');
  }

  // Pattern 2: Very random looking prefix (many consecutive digits)
  if (/\d{6,}/.test(prefix)) {
    score += 25;
    reasons.push('Email prefix contains long digit sequence');
  }

  // Pattern 3: Generic test/temp prefixes
  const genericPrefixes = ['test', 'temp', 'user', 'dummy', 'fake', 'throwaway'];
  if (genericPrefixes.some(p => prefix.startsWith(p))) {
    score += 35;
    reasons.push('Email uses generic/test prefix');
  }

  score = Math.min(100, score);

  return {
    detected: score > 30,
    score,
    reason: reasons.length > 0 ? reasons.join('; ') : undefined,
    details: {
      email,
      domain,
      prefix,
      patterns: reasons,
    },
  };
}

/**
 * Detect similar email patterns across multiple accounts
 */
export function detectEmailPatternCluster(
  accounts: Array<{ email: string | null; username: string }>
): {
  clusters: Array<{
    type: string;
    accounts: string[];
    pattern: string;
    score: number;
  }>;
  overallScore: number;
} {
  const domainMap = new Map<string, string[]>();
  const prefixPatternMap = new Map<string, string[]>();

  accounts.forEach(account => {
    if (!account.email) return;

    const domain = extractDomain(account.email);
    if (domain) {
      if (!domainMap.has(domain)) {
        domainMap.set(domain, []);
      }
      domainMap.get(domain)!.push(account.username);
    }

    // Check prefix patterns
    const prefix = account.email.split('@')[0].toLowerCase();
    const basePrefix = prefix.replace(/\d+$/, '');

    if (basePrefix && basePrefix !== prefix) {
      if (!prefixPatternMap.has(basePrefix)) {
        prefixPatternMap.set(basePrefix, []);
      }
      prefixPatternMap.get(basePrefix)!.push(account.username);
    }
  });

  const clusters: Array<{
    type: string;
    accounts: string[];
    pattern: string;
    score: number;
  }> = [];

  // Analyze domain clusters
  domainMap.forEach((usernames, domain) => {
    if (usernames.length >= 2) {
      const score = Math.min(100, 40 + usernames.length * 10);
      clusters.push({
        type: 'shared-domain',
        accounts: usernames,
        pattern: domain,
        score,
      });
    }
  });

  // Analyze prefix pattern clusters
  prefixPatternMap.forEach((usernames, basePrefix) => {
    if (usernames.length >= 2) {
      const score = Math.min(100, 35 + usernames.length * 12);
      clusters.push({
        type: 'similar-prefix',
        accounts: usernames,
        pattern: `${basePrefix}*`,
        score,
      });
    }
  });

  clusters.sort((a, b) => b.score - a.score);

  const overallScore = clusters.length > 0 ? Math.max(...clusters.map(c => c.score)) : 0;

  return {
    clusters,
    overallScore,
  };
}
