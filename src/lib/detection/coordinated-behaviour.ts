import { DetectionResult } from '@/types/analysis';

interface CommentData {
  username: string;
  content: string;
  createdAt: Date;
}

/**
 * Calculate text similarity using simple word overlap (Jaccard similarity)
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(
    text1
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
  );
  const words2 = new Set(
    text2
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
  );

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Detect similar writing styles across accounts
 */
export function detectSimilarWritingStyles(comments: CommentData[]): {
  similarPairs: Array<{
    account1: string;
    account2: string;
    similarity: number;
    score: number;
  }>;
  overallScore: number;
} {
  // Group comments by account
  const accountComments = new Map<string, string[]>();

  comments.forEach(comment => {
    if (!accountComments.has(comment.username)) {
      accountComments.set(comment.username, []);
    }
    accountComments.get(comment.username)!.push(comment.content);
  });

  const accounts = Array.from(accountComments.keys());
  const similarPairs: Array<{
    account1: string;
    account2: string;
    similarity: number;
    score: number;
  }> = [];

  // Compare each pair of accounts
  for (let i = 0; i < accounts.length; i++) {
    for (let j = i + 1; j < accounts.length; j++) {
      const account1 = accounts[i];
      const account2 = accounts[j];

      const comments1 = accountComments.get(account1)!;
      const comments2 = accountComments.get(account2)!;

      // Calculate average similarity across all comment pairs
      let totalSimilarity = 0;
      let comparisons = 0;

      comments1.forEach(c1 => {
        comments2.forEach(c2 => {
          totalSimilarity += calculateTextSimilarity(c1, c2);
          comparisons++;
        });
      });

      if (comparisons === 0) continue;

      const avgSimilarity = totalSimilarity / comparisons;

      if (avgSimilarity >= 0.4) {
        // Significant similarity
        const score = Math.min(100, avgSimilarity * 150);
        similarPairs.push({
          account1,
          account2,
          similarity: avgSimilarity,
          score,
        });
      }
    }
  }

  const overallScore = similarPairs.length > 0 ? Math.max(...similarPairs.map(p => p.score)) : 0;

  return {
    similarPairs: similarPairs.sort((a, b) => b.score - a.score),
    overallScore,
  };
}

/**
 * Build interaction network and detect tightly clustered groups
 */
export function detectNetworkClusters(
  comments: CommentData[]
): {
  clusters: Array<{
    accounts: string[];
    strength: number;
    score: number;
  }>;
  overallScore: number;
} {
  // Build adjacency map
  const interactionMap = new Map<string, Set<string>>();

  // Track which accounts comment near each other (time-based proximity)
  const sortedComments = [...comments].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  const timeWindow = 24 * 60 * 60 * 1000; // 24 hours

  sortedComments.forEach((comment, index) => {
    if (!interactionMap.has(comment.username)) {
      interactionMap.set(comment.username, new Set());
    }

    // Look at nearby comments (within time window)
    for (let i = index + 1; i < sortedComments.length; i++) {
      const otherComment = sortedComments[i];
      const timeDiff = otherComment.createdAt.getTime() - comment.createdAt.getTime();

      if (timeDiff > timeWindow) break;

      if (otherComment.username !== comment.username) {
        interactionMap.get(comment.username)!.add(otherComment.username);

        if (!interactionMap.has(otherComment.username)) {
          interactionMap.set(otherComment.username, new Set());
        }
        interactionMap.get(otherComment.username)!.add(comment.username);
      }
    }
  });

  // Find densely connected subgraphs (clusters)
  const visited = new Set<string>();
  const clusters: Array<{
    accounts: string[];
    strength: number;
    score: number;
  }> = [];

  interactionMap.forEach((connections, account) => {
    if (visited.has(account)) return;

    // Start a new cluster
    const cluster = new Set<string>([account]);
    const toVisit = [account];

    while (toVisit.length > 0) {
      const current = toVisit.pop()!;
      visited.add(current);

      const currentConnections = interactionMap.get(current) || new Set();

      currentConnections.forEach(connected => {
        if (!cluster.has(connected)) {
          // Check if this account is well-connected to the cluster
          const connectedTo = interactionMap.get(connected) || new Set();
          const overlapCount = Array.from(cluster).filter(c => connectedTo.has(c)).length;

          // Add to cluster if connected to at least 50% of existing members
          if (overlapCount >= cluster.size * 0.5) {
            cluster.add(connected);
            toVisit.push(connected);
          }
        }
      });
    }

    if (cluster.size >= 2) {
      // Calculate cluster strength (density of connections)
      let totalConnections = 0;
      const maxPossibleConnections = (cluster.size * (cluster.size - 1)) / 2;

      cluster.forEach(account => {
        const connections = interactionMap.get(account) || new Set();
        const clusterConnections = Array.from(connections).filter(c => cluster.has(c));
        totalConnections += clusterConnections.length;
      });

      totalConnections /= 2; // Each edge counted twice

      const strength = maxPossibleConnections > 0 ? totalConnections / maxPossibleConnections : 0;
      const score = Math.min(100, 30 + cluster.size * 15 + strength * 40);

      clusters.push({
        accounts: Array.from(cluster),
        strength,
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

/**
 * Comprehensive coordinated behaviour detection
 */
export function detectCoordinatedBehaviour(comments: CommentData[]): DetectionResult {
  if (comments.length < 2) {
    return {
      detected: false,
      score: 0,
      reason: 'Insufficient comments for analysis',
    };
  }

  // Run multiple detection methods
  const writingStyleResult = detectSimilarWritingStyles(comments);
  const networkResult = detectNetworkClusters(comments);

  // Combine scores with weights
  const combinedScore = Math.min(
    100,
    writingStyleResult.overallScore * 0.4 + networkResult.overallScore * 0.6
  );

  const reasons: string[] = [];

  if (writingStyleResult.similarPairs.length > 0) {
    reasons.push(`${writingStyleResult.similarPairs.length} account pairs with similar writing`);
  }

  if (networkResult.clusters.length > 0) {
    reasons.push(`${networkResult.clusters.length} tightly connected network cluster(s)`);
  }

  return {
    detected: combinedScore > 40,
    score: combinedScore,
    reason: reasons.length > 0 ? reasons.join('; ') : undefined,
    details: {
      writingStyleSimilarity: writingStyleResult,
      networkClusters: networkResult,
    },
  };
}
