import { DetectionResult } from '@/types/analysis';

interface ActivitySummary {
  eventsSampled: number;
  repositories: Array<{ name: string; events: number }>;
}

function parseActivitySummary(value: unknown): ActivitySummary | null {
  if (!value || typeof value !== 'object') return null;
  const summary = value as Partial<ActivitySummary>;
  if (typeof summary.eventsSampled !== 'number' || !Array.isArray(summary.repositories)) {
    return null;
  }
  return summary as ActivitySummary;
}

/**
 * An empty profile (no public repositories, no followers) is typical of throwaway accounts
 */
function profileCounts(profile: unknown): { publicRepos: number; followers: number } | null {
  if (!profile || typeof profile !== 'object') return null;
  const { public_repos: publicRepos, followers } = profile as Record<string, unknown>;
  if (typeof publicRepos !== 'number' || typeof followers !== 'number') return null;
  return { publicRepos, followers };
}

/**
 * Detect accounts whose recent public GitHub activity is concentrated on this one
 * repository, or that have an empty profile. Uses the account's public events
 * (synced from GitHub), not just the comments stored for this repository.
 */
export function detectSingleRepositoryActivity(
  activitySummary: unknown,
  profile: unknown,
  repositoryFullName: string
): DetectionResult {
  const summary = parseActivitySummary(activitySummary);
  const counts = profileCounts(profile);
  const thinProfile = counts !== null && counts.publicRepos === 0 && counts.followers === 0;
  const reasons: string[] = [];
  let score = 0;

  let shareHere: number | null = null;
  if (summary && summary.eventsSampled > 0) {
    const eventsHere = summary.repositories
      .filter(repo => repo.name.toLowerCase() === repositoryFullName.toLowerCase())
      .reduce((sum, repo) => sum + repo.events, 0);
    shareHere = eventsHere / summary.eventsSampled;

    if (summary.eventsSampled >= 3) {
      if (shareHere >= 0.9) score = 80;
      else if (shareHere >= 0.75) score = 60;
      else if (shareHere >= 0.6) score = 40;
    } else if (shareHere === 1) {
      // Very little public activity, all of it here
      score = 30;
    }

    // Active across several repositories: more likely a genuine contributor
    if (summary.repositories.length >= 4) {
      score = Math.max(0, score - 20);
    }

    if (score > 0) {
      reasons.push(
        `${Math.round(shareHere * 100)}% of recent public activity is in this repository`
      );
    }
  }

  if (thinProfile) {
    score += 30;
    reasons.push('No public repositories or followers');
  }

  score = Math.min(100, score);

  return {
    detected: score > 30,
    score,
    // Nothing to go on until the account's profile has been synced from GitHub
    evaluated: summary !== null || counts !== null,
    reason: reasons.length > 0 ? reasons.join('; ') : undefined,
    details: {
      activitySynced: summary !== null,
      eventsSampled: summary?.eventsSampled ?? 0,
      shareInRepository: shareHere,
      repositoriesActiveIn: summary?.repositories.length ?? 0,
      thinProfile,
    },
  };
}
