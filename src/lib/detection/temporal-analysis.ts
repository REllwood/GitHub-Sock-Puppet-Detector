import { DetectionResult } from '@/types/analysis';

interface CommentActivity {
  username: string;
  commentId: string;
  createdAt: Date;
  content: string;
}

/**
 * Detect temporal clustering - multiple accounts commenting within short time windows
 */
export function detectTemporalClustering(
  comments: CommentActivity[],
  timeWindowHours: number = 24
): DetectionResult {
  if (comments.length < 2) {
    return {
      detected: false,
      score: 0,
      reason: 'Insufficient comments for analysis',
    };
  }

  // Sort comments by time
  const sortedComments = [...comments].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  const timeWindowMs = timeWindowHours * 60 * 60 * 1000;
  const clusters: Array<{
    startTime: Date;
    endTime: Date;
    accounts: Set<string>;
    comments: CommentActivity[];
  }> = [];

  // Sliding window to detect clusters
  for (let i = 0; i < sortedComments.length; i++) {
    const windowStart = sortedComments[i].createdAt;
    const windowEnd = new Date(windowStart.getTime() + timeWindowMs);

    const windowComments = sortedComments.filter(
      c => c.createdAt >= windowStart && c.createdAt <= windowEnd
    );

    const uniqueAccounts = new Set(windowComments.map(c => c.username));

    if (uniqueAccounts.size >= 2) {
      // Check if this cluster overlaps with existing ones
      const overlapping = clusters.find(
        cluster =>
          windowStart >= cluster.startTime &&
          windowStart <= new Date(cluster.endTime.getTime() + timeWindowMs)
      );

      if (!overlapping) {
        clusters.push({
          startTime: windowStart,
          endTime: windowEnd,
          accounts: uniqueAccounts,
          comments: windowComments,
        });
      }
    }
  }

  if (clusters.length === 0) {
    return {
      detected: false,
      score: 0,
      details: { clusters: [] },
    };
  }

  // Calculate score based on cluster characteristics
  let maxScore = 0;
  clusters.forEach(cluster => {
    const accountCount = cluster.accounts.size;
    const commentCount = cluster.comments.length;

    // More accounts and more comments = higher score
    let clusterScore = Math.min(100, 30 + accountCount * 15 + commentCount * 5);

    // Boost score if comments are very close together (< 1 hour)
    const timeSpanHours =
      (cluster.endTime.getTime() - cluster.startTime.getTime()) / (1000 * 60 * 60);

    if (timeSpanHours < 1 && accountCount >= 3) {
      clusterScore = Math.min(100, clusterScore + 30);
    }

    maxScore = Math.max(maxScore, clusterScore);
  });

  return {
    detected: maxScore > 40,
    score: maxScore,
    reason: `Detected ${clusters.length} temporal cluster(s)`,
    details: {
      clusterCount: clusters.length,
      clusters: clusters.map(c => ({
        startTime: c.startTime.toISOString(),
        endTime: c.endTime.toISOString(),
        accountCount: c.accounts.size,
        accounts: Array.from(c.accounts),
        commentCount: c.comments.length,
      })),
      timeWindowHours,
    },
  };
}

/**
 * Detect if accounts always comment together (coordination pattern)
 */
export function detectAlwaysTogetherPattern(
  accountComments: Map<string, CommentActivity[]>
): {
  pairs: Array<{
    account1: string;
    account2: string;
    coOccurrenceRate: number;
    score: number;
  }>;
  overallScore: number;
} {
  const accounts = Array.from(accountComments.keys());
  const pairs: Array<{
    account1: string;
    account2: string;
    coOccurrenceRate: number;
    score: number;
  }> = [];

  // Check each pair of accounts
  for (let i = 0; i < accounts.length; i++) {
    for (let j = i + 1; j < accounts.length; j++) {
      const account1 = accounts[i];
      const account2 = accounts[j];

      const comments1 = accountComments.get(account1)!;
      const comments2 = accountComments.get(account2)!;

      // Count how often they comment within 24 hours of each other
      let coOccurrences = 0;
      const timeWindow = 24 * 60 * 60 * 1000; // 24 hours

      comments1.forEach(c1 => {
        const hasCloseComment = comments2.some(c2 => {
          const timeDiff = Math.abs(c1.createdAt.getTime() - c2.createdAt.getTime());
          return timeDiff <= timeWindow;
        });

        if (hasCloseComment) {
          coOccurrences++;
        }
      });

      const totalComments = Math.min(comments1.length, comments2.length);
      if (totalComments === 0) continue;

      const coOccurrenceRate = coOccurrences / totalComments;

      if (coOccurrenceRate >= 0.5) {
        // They comment together at least 50% of the time
        const score = Math.min(100, 50 + coOccurrenceRate * 50);
        pairs.push({
          account1,
          account2,
          coOccurrenceRate,
          score,
        });
      }
    }
  }

  const overallScore = pairs.length > 0 ? Math.max(...pairs.map(p => p.score)) : 0;

  return {
    pairs: pairs.sort((a, b) => b.score - a.score),
    overallScore,
  };
}
