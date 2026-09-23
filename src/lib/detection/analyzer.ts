import { prisma } from '@/lib/db';
import { detectAccountAge } from './account-age';
import { detectNamePattern } from './name-patterns';
import { detectEmailPattern } from './email-patterns';
import { detectSingleRepositoryActivity } from './single-repo';
import { analyseCoordination, type RepositoryComment } from './coordinated-behaviour';
import { analyseNewcomerBursts } from './temporal-analysis';
import { createLLMAnalyzer, toAccountDetections, type LLMAnalyzer } from './llm-analysis';
import { createAccountRiskAnalysis } from './risk-scorer';
import type { AccountRiskAnalysis, ClusterDetection, DetectionResult } from '@/types/analysis';

// Most recent comments considered per analysis
const MAX_COMMENTS = 2000;

const NOT_DETECTED = { detected: false, score: 0 };

/**
 * Run the optional LLM assessment. Failures are logged and the analysis continues without it.
 */
async function runLLMAnalysis(
  llm: LLMAnalyzer,
  comments: RepositoryComment[],
  usernames: string[]
): Promise<{ detections: Map<string, DetectionResult>; cluster: ClusterDetection | null } | null> {
  try {
    const { assessment, includedUsernames } = await llm.assess(comments);
    const flagged = assessment.suspiciousAccounts.filter(account => account.score >= 50);

    return {
      detections: toAccountDetections(assessment, includedUsernames, usernames),
      cluster:
        flagged.length >= 2
          ? {
              type: 'llm',
              accounts: flagged.map(account => account.username).sort(),
              score: Math.max(...flagged.map(account => account.score)),
              patterns: assessment.summary ? [assessment.summary] : [],
            }
          : null,
    };
  } catch (error) {
    console.warn(`LLM analysis (${llm.provider}) failed, continuing without it:`, error);
    return null;
  }
}

/**
 * Analyse every account that has commented on a repository, in the context of the
 * repository's other commenters.
 */
export async function analyzeRepository(
  repositoryId: string,
  options: { llm?: LLMAnalyzer | null } = {}
): Promise<{
  accountAnalyses: AccountRiskAnalysis[];
  clusters: ClusterDetection[];
}> {
  const repository = await prisma.repository.findUnique({
    where: { id: repositoryId },
    select: { fullName: true },
  });

  if (!repository) {
    throw new Error(`Repository ${repositoryId} not found`);
  }

  const comments = await prisma.comment.findMany({
    where: { repositoryId },
    include: { account: true },
    orderBy: { createdAt: 'desc' },
    take: MAX_COMMENTS,
  });

  if (comments.length === 0) {
    return { accountAnalyses: [], clusters: [] };
  }

  const repositoryComments: RepositoryComment[] = comments.map(comment => ({
    username: comment.account.username,
    content: comment.content,
    createdAt: comment.createdAt,
    thread: comment.issueNumber ?? comment.prNumber ?? null,
  }));

  const coordination = analyseCoordination(repositoryComments);
  const bursts = analyseNewcomerBursts(repositoryComments);

  // Unique accounts, with the time of their first comment in the repository
  const accounts = new Map<string, { account: (typeof comments)[0]['account']; first: Date }>();
  for (const comment of comments) {
    const entry = accounts.get(comment.accountId);
    if (!entry) {
      accounts.set(comment.accountId, { account: comment.account, first: comment.createdAt });
    } else if (comment.createdAt < entry.first) {
      entry.first = comment.createdAt;
    }
  }

  const llm = options.llm === undefined ? createLLMAnalyzer() : options.llm;
  const llmResult = llm
    ? await runLLMAnalysis(
        llm,
        repositoryComments,
        Array.from(accounts.values()).map(({ account }) => account.username)
      )
    : null;

  const accountAnalyses = Array.from(accounts.values()).map(({ account, first }) =>
    createAccountRiskAnalysis(account.id, account.username, {
      accountAge: detectAccountAge(account.createdAt, undefined, first),
      namePattern: detectNamePattern(account.username),
      emailPattern: detectEmailPattern(account.email),
      singleRepo: detectSingleRepositoryActivity(
        account.activitySummary,
        account.profileData,
        repository.fullName
      ),
      coordinatedBehaviour: coordination.byAccount.get(account.username) ?? NOT_DETECTED,
      temporalClustering: bursts.byAccount.get(account.username) ?? NOT_DETECTED,
      llmAnalysis: llmResult?.detections.get(account.username),
    })
  );

  return {
    accountAnalyses: accountAnalyses.sort((a, b) => b.riskScore - a.riskScore),
    clusters: [
      ...coordination.clusters,
      ...bursts.clusters,
      ...(llmResult?.cluster ? [llmResult.cluster] : []),
    ],
  };
}
