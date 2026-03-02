import { DetectionResult } from '@/types/analysis';

interface RepositoryActivity {
  repositoryId: string;
  repositoryName: string;
  commentCount: number;
}

/**
 * Detect accounts that only contribute to a single repository
 */
export function detectSingleRepositoryActivity(
  activities: RepositoryActivity[],
  threshold: number = 0.9
): DetectionResult {
  if (activities.length === 0) {
    return {
      detected: false,
      score: 0,
      reason: 'No activity found',
    };
  }

  const totalComments = activities.reduce((sum, a) => sum + a.commentCount, 0);

  if (totalComments === 0) {
    return {
      detected: false,
      score: 0,
      reason: 'No comments found',
    };
  }

  // Sort by comment count
  const sortedActivities = [...activities].sort((a, b) => b.commentCount - a.commentCount);
  const topRepo = sortedActivities[0];
  const topRepoPercentage = topRepo.commentCount / totalComments;

  let score = 0;
  let detected = false;

  if (topRepoPercentage >= threshold) {
    // Very focused on single repo
    score = 100;
    detected = true;
  } else if (topRepoPercentage >= 0.8) {
    score = 80;
    detected = true;
  } else if (topRepoPercentage >= 0.7) {
    score = 60;
    detected = true;
  } else if (topRepoPercentage >= 0.6) {
    score = 40;
    detected = true;
  } else {
    score = 0;
    detected = false;
  }

  // Reduce score if account has activity in multiple repos (more likely legitimate)
  if (activities.length > 3) {
    score = Math.max(0, score - 20);
    detected = score > 30;
  }

  return {
    detected,
    score,
    reason: detected
      ? `${(topRepoPercentage * 100).toFixed(1)}% of activity in single repository`
      : undefined,
    details: {
      totalRepositories: activities.length,
      totalComments,
      topRepository: topRepo.repositoryName,
      topRepositoryPercentage: topRepoPercentage,
      activityBreakdown: sortedActivities,
    },
  };
}

/**
 * Calculate repository activity from comments
 */
export function calculateRepositoryActivity(
  comments: Array<{
    repositoryId: string | null;
    repository?: { fullName: string } | null;
  }>
): RepositoryActivity[] {
  const repoMap = new Map<string, { name: string; count: number }>();

  comments.forEach(comment => {
    if (!comment.repositoryId) return;

    const repoName = comment.repository?.fullName || 'Unknown';

    if (!repoMap.has(comment.repositoryId)) {
      repoMap.set(comment.repositoryId, { name: repoName, count: 0 });
    }

    repoMap.get(comment.repositoryId)!.count++;
  });

  return Array.from(repoMap.entries()).map(([id, data]) => ({
    repositoryId: id,
    repositoryName: data.name,
    commentCount: data.count,
  }));
}

/**
 * Detect multiple accounts focused on the same single repository
 */
export function detectCoordinatedSingleRepoActivity(
  accountActivities: Array<{
    username: string;
    activities: RepositoryActivity[];
  }>
): {
  clusters: Array<{
    repositoryId: string;
    repositoryName: string;
    accounts: string[];
    score: number;
  }>;
  overallScore: number;
} {
  // Find accounts that are single-repo focused
  const singleRepoAccounts = accountActivities
    .map(account => {
      const result = detectSingleRepositoryActivity(account.activities);
      if (!result.detected || !result.details) return null;

      const topRepo = account.activities.sort((a, b) => b.commentCount - a.commentCount)[0];
      return {
        username: account.username,
        repositoryId: topRepo.repositoryId,
        repositoryName: topRepo.repositoryName,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Group by repository
  const repoGroups = new Map<string, Array<{ username: string; repositoryName: string }>>();

  singleRepoAccounts.forEach(account => {
    if (!repoGroups.has(account.repositoryId)) {
      repoGroups.set(account.repositoryId, []);
    }
    repoGroups.get(account.repositoryId)!.push({
      username: account.username,
      repositoryName: account.repositoryName,
    });
  });

  // Create clusters for repos with 2+ single-focused accounts
  const clusters = Array.from(repoGroups.entries())
    .filter(([_, accounts]) => accounts.length >= 2)
    .map(([repositoryId, accounts]) => {
      const score = Math.min(100, 50 + accounts.length * 15);
      return {
        repositoryId,
        repositoryName: accounts[0].repositoryName,
        accounts: accounts.map(a => a.username),
        score,
      };
    })
    .sort((a, b) => b.score - a.score);

  const overallScore = clusters.length > 0 ? Math.max(...clusters.map(c => c.score)) : 0;

  return {
    clusters,
    overallScore,
  };
}
