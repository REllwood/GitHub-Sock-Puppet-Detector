import type { DetectionResult } from '@/types/analysis';
import type { RepositoryComment } from './coordinated-behaviour';

export interface TemporalCluster {
  type: 'temporal';
  accounts: string[];
  thread: number | null;
  timeWindow: { start: string; end: string };
  score: number;
}

// Newcomers arriving on the same thread within this window form a burst
const BURST_WINDOW_MS = 6 * 60 * 60 * 1000;
const MIN_NEWCOMERS = 3;
const TIGHT_BURST_MS = 60 * 60 * 1000;

/**
 * Score a burst of newcomers (0 - 100): more accounts and a tighter window score higher
 */
export function scoreBurst(newcomers: number, spreadMs: number): number {
  if (newcomers < MIN_NEWCOMERS) return 0;

  let score = Math.min(85, 50 + (newcomers - MIN_NEWCOMERS) * 10);
  if (spreadMs <= TIGHT_BURST_MS) score += 15;

  return Math.min(100, score);
}

/**
 * Detect bursts of accounts that show up in the repository for the first time on the
 * same thread within a short window - the pattern of a brigade or sock puppet pile-on.
 * Regular participants joining a discussion are not counted.
 */
export function analyseNewcomerBursts(comments: RepositoryComment[]): {
  byAccount: Map<string, DetectionResult>;
  clusters: TemporalCluster[];
} {
  // Each account's first comment in the repository
  const firstComments = new Map<string, RepositoryComment>();
  for (const comment of comments) {
    const current = firstComments.get(comment.username);
    if (!current || comment.createdAt < current.createdAt) {
      firstComments.set(comment.username, comment);
    }
  }

  // Group arrivals by thread
  const arrivalsByThread = new Map<number | null, RepositoryComment[]>();
  firstComments.forEach(comment => {
    const list = arrivalsByThread.get(comment.thread) ?? [];
    list.push(comment);
    arrivalsByThread.set(comment.thread, list);
  });

  const clusters: TemporalCluster[] = [];

  arrivalsByThread.forEach((arrivals, thread) => {
    const sorted = arrivals.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    let start = 0;
    while (start < sorted.length) {
      let end = start;
      while (
        end + 1 < sorted.length &&
        sorted[end + 1].createdAt.getTime() - sorted[start].createdAt.getTime() <= BURST_WINDOW_MS
      ) {
        end++;
      }

      const burst = sorted.slice(start, end + 1);
      if (burst.length >= MIN_NEWCOMERS) {
        const first = burst[0].createdAt;
        const last = burst[burst.length - 1].createdAt;
        clusters.push({
          type: 'temporal',
          accounts: burst.map(comment => comment.username),
          thread,
          timeWindow: { start: first.toISOString(), end: last.toISOString() },
          score: scoreBurst(burst.length, last.getTime() - first.getTime()),
        });
        start = end + 1;
      } else {
        start++;
      }
    }
  });

  clusters.sort((a, b) => b.score - a.score);

  const byAccount = new Map<string, DetectionResult>();
  firstComments.forEach((_comment, username) => {
    const cluster = clusters.find(c => c.accounts.includes(username));

    if (!cluster) {
      byAccount.set(username, { detected: false, score: 0 });
      return;
    }

    const where = cluster.thread === null ? 'the repository' : `#${cluster.thread}`;
    const spreadMinutes = Math.round(
      (new Date(cluster.timeWindow.end).getTime() - new Date(cluster.timeWindow.start).getTime()) /
        60000
    );

    byAccount.set(username, {
      detected: true,
      score: cluster.score,
      reason: `First appeared in ${where} alongside ${cluster.accounts.length - 1} other new account(s) within ${spreadMinutes} minutes`,
      details: {
        thread: cluster.thread,
        accounts: cluster.accounts,
        timeWindow: cluster.timeWindow,
      },
    });
  });

  return { byAccount, clusters };
}
