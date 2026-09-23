import type { DetectionResult } from '@/types/analysis';
import { contentTokens, jaccard, normaliseComment } from './text';

export interface RepositoryComment {
  username: string;
  content: string;
  createdAt: Date;
  // Issue or pull request number (they share a number space); null if unknown
  thread: number | null;
}

export interface CoordinationCluster {
  type: 'coordination';
  accounts: string[];
  strength: number;
  score: number;
  patterns: string[];
}

export interface PairEvidence {
  similarity: number;
  duplicate: boolean;
  sharedThreads: Set<number>;
}

// Comments with fewer meaningful words ("+1", "same here", "any update?") say nothing about authorship
const MIN_TOKENS = 4;
// Accounts count as appearing together on a thread if they comment within this window
const SAME_THREAD_WINDOW_MS = 72 * 60 * 60 * 1000;
// Only compare wording of comments on the same thread made within this window
const SIMILARITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// Bound the pairwise work on very long threads (most recent comments are kept)
const MAX_COMMENTS_PER_THREAD = 300;
// Pair score at which two accounts are considered to be acting together
export const STRONG_PAIR_SCORE = 45;

interface PreparedComment {
  username: string;
  time: number;
  thread: number | null;
  tokens: Set<string>;
  fingerprint: string | null;
}

function pairKey(a: string, b: string): [string, string, string] {
  return a < b ? [`${a}\u0000${b}`, a, b] : [`${b}\u0000${a}`, b, a];
}

/**
 * Score how strongly two accounts appear to be coordinating (0 - 100)
 */
export function scorePair(evidence: PairEvidence): number {
  let score = 0;

  if (evidence.duplicate || evidence.similarity >= 0.8) {
    score = 85;
  } else if (evidence.similarity >= 0.6) {
    score = 65;
  } else if (evidence.similarity >= 0.4) {
    score = STRONG_PAIR_SCORE;
  }

  const threads = evidence.sharedThreads.size;

  // Similar messaging delivered on the same thread
  if (score > 0 && threads >= 1) score += 10;

  // Repeatedly turning up together. Weak on its own: maintainers do this legitimately.
  if (threads >= 3) score += 20;

  return Math.min(100, score);
}

/**
 * Gather pairwise evidence of coordination between accounts: similar or identical wording,
 * and appearing together on the same threads.
 */
export function collectPairEvidence(
  comments: RepositoryComment[]
): Map<string, { accounts: [string, string]; evidence: PairEvidence }> {
  const pairs = new Map<string, { accounts: [string, string]; evidence: PairEvidence }>();

  const getPair = (a: string, b: string) => {
    const [key, first, second] = pairKey(a, b);
    let pair = pairs.get(key);
    if (!pair) {
      pair = {
        accounts: [first, second],
        evidence: { similarity: 0, duplicate: false, sharedThreads: new Set() },
      };
      pairs.set(key, pair);
    }
    return pair.evidence;
  };

  const prepared: PreparedComment[] = comments.map(comment => {
    const tokens = contentTokens(comment.content);
    const fingerprint =
      tokens.size >= MIN_TOKENS
        ? normaliseComment(comment.content).replace(/\W+/g, ' ').trim()
        : null;
    return {
      username: comment.username,
      time: comment.createdAt.getTime(),
      thread: comment.thread,
      tokens,
      fingerprint,
    };
  });

  // Identical wording anywhere in the repository
  const byFingerprint = new Map<string, Set<string>>();
  for (const comment of prepared) {
    if (!comment.fingerprint) continue;
    const authors = byFingerprint.get(comment.fingerprint) ?? new Set<string>();
    authors.add(comment.username);
    byFingerprint.set(comment.fingerprint, authors);
  }
  byFingerprint.forEach(authors => {
    const list = Array.from(authors);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const evidence = getPair(list[i], list[j]);
        evidence.duplicate = true;
        evidence.similarity = 1;
      }
    }
  });

  // Same-thread behaviour
  const byThread = new Map<number, PreparedComment[]>();
  for (const comment of prepared) {
    if (comment.thread === null) continue;
    const list = byThread.get(comment.thread) ?? [];
    list.push(comment);
    byThread.set(comment.thread, list);
  }

  byThread.forEach((threadComments, thread) => {
    const sorted = threadComments.sort((a, b) => a.time - b.time).slice(-MAX_COMMENTS_PER_THREAD);

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        const gap = b.time - a.time;
        if (gap > SIMILARITY_WINDOW_MS) break;
        if (a.username === b.username) continue;

        const evidence = getPair(a.username, b.username);

        if (gap <= SAME_THREAD_WINDOW_MS) {
          evidence.sharedThreads.add(thread);
        }

        if (a.tokens.size >= MIN_TOKENS && b.tokens.size >= MIN_TOKENS) {
          evidence.similarity = Math.max(evidence.similarity, jaccard(a.tokens, b.tokens));
        }
      }
    }
  });

  return pairs;
}

function describePair(username: string, evidence: PairEvidence): string {
  if (evidence.duplicate || evidence.similarity >= 0.8) {
    return `near-identical comments to ${username}`;
  }
  if (evidence.similarity >= 0.4) {
    return `similar messaging to ${username}`;
  }
  return `repeatedly comments alongside ${username}`;
}

/**
 * Per-account coordinated behaviour detection, plus clusters of accounts acting together
 */
export function analyseCoordination(comments: RepositoryComment[]): {
  byAccount: Map<string, DetectionResult>;
  clusters: CoordinationCluster[];
} {
  const pairs = collectPairEvidence(comments);
  const partnersByAccount = new Map<
    string,
    Array<{ username: string; score: number; evidence: PairEvidence }>
  >();

  pairs.forEach(({ accounts: [a, b], evidence }) => {
    const score = scorePair(evidence);
    if (score === 0) return;

    for (const [self, other] of [
      [a, b],
      [b, a],
    ]) {
      const list = partnersByAccount.get(self) ?? [];
      list.push({ username: other, score, evidence });
      partnersByAccount.set(self, list);
    }
  });

  const clusters = buildClusters(pairs);
  const inLargeGroup = new Set(
    clusters.filter(cluster => cluster.accounts.length >= 3).flatMap(cluster => cluster.accounts)
  );

  const byAccount = new Map<string, DetectionResult>();
  const usernames = new Set(comments.map(comment => comment.username));

  usernames.forEach(username => {
    const partners = (partnersByAccount.get(username) ?? []).sort((x, y) => y.score - x.score);

    if (partners.length === 0) {
      byAccount.set(username, { detected: false, score: 0 });
      return;
    }

    const strongPartners = partners.filter(p => p.score >= STRONG_PAIR_SCORE);
    let score = partners[0].score;
    // Part of a wider group acting together, not just one similar pair
    if (strongPartners.length >= 2 || inLargeGroup.has(username)) {
      score = Math.min(100, score + 10);
    }

    const detected = score >= STRONG_PAIR_SCORE;
    const described = (strongPartners.length > 0 ? strongPartners : partners).slice(0, 3);

    byAccount.set(username, {
      detected,
      score,
      reason: detected
        ? described.map(p => describePair(p.username, p.evidence)).join('; ')
        : undefined,
      details: {
        partners: partners.slice(0, 5).map(p => ({
          username: p.username,
          score: p.score,
          similarity: Number(p.evidence.similarity.toFixed(2)),
          sharedThreads: Array.from(p.evidence.sharedThreads),
        })),
      },
    });
  });

  return { byAccount, clusters };
}

/**
 * Group accounts connected by strong pairwise coordination (connected components)
 */
function buildClusters(pairs: ReturnType<typeof collectPairEvidence>): CoordinationCluster[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };

  const strongEdges: Array<{ a: string; b: string; score: number; evidence: PairEvidence }> = [];
  pairs.forEach(({ accounts: [a, b], evidence }) => {
    const score = scorePair(evidence);
    if (score < STRONG_PAIR_SCORE) return;
    strongEdges.push({ a, b, score, evidence });
    parent.set(find(a), find(b));
  });

  const components = new Map<string, typeof strongEdges>();
  for (const edge of strongEdges) {
    const root = find(edge.a);
    const list = components.get(root) ?? [];
    list.push(edge);
    components.set(root, list);
  }

  return Array.from(components.values())
    .map(edges => {
      const accounts = Array.from(new Set(edges.flatMap(edge => [edge.a, edge.b]))).sort();
      const patterns = new Set<string>();
      for (const { evidence } of edges) {
        if (evidence.duplicate || evidence.similarity >= 0.8)
          patterns.add('near-identical comments');
        else if (evidence.similarity >= 0.4) patterns.add('similar messaging');
        if (evidence.sharedThreads.size > 0) patterns.add('same threads');
      }

      return {
        type: 'coordination' as const,
        accounts,
        strength: Number(
          (edges.reduce((sum, edge) => sum + edge.score, 0) / edges.length / 100).toFixed(2)
        ),
        score: Math.max(...edges.map(edge => edge.score)),
        patterns: Array.from(patterns),
      };
    })
    .sort((x, y) => y.score - x.score);
}
