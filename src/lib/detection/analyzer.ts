import { prisma } from '@/lib/db';
import { detectAccountAge } from './account-age';
import { detectNamePattern } from './name-patterns';
import { detectEmailPattern } from './email-patterns';
import {
  calculateRepositoryActivity,
  detectSingleRepositoryActivity,
} from './single-repo';
import { detectCoordinatedBehaviour } from './coordinated-behaviour';
import { detectTemporalClustering } from './temporal-analysis';
import { createAccountRiskAnalysis } from './risk-scorer';
import type { AccountRiskAnalysis } from '@/types/analysis';

/**
 * Analyze a single account
 */
export async function analyzeAccount(accountId: string): Promise<AccountRiskAnalysis> {
  // Fetch account data
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      comments: {
        include: {
          account: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      },
    },
  });

  if (!account) {
    throw new Error(`Account ${accountId} not found`);
  }

  // Run all detection algorithms
  const accountAgeResult = detectAccountAge(account.createdAt);
  const namePatternResult = detectNamePattern(account.username);
  const emailPatternResult = detectEmailPattern(account.email);

  // Calculate repository activity
  const repositoryActivity = calculateRepositoryActivity(account.comments);
  const singleRepoResult = detectSingleRepositoryActivity(repositoryActivity);

  // For coordinated behaviour and temporal analysis, we need context from other accounts
  // For now, use empty results (will be enriched in repository-wide analysis)
  const coordinatedBehaviourResult = {
    detected: false,
    score: 0,
  };

  const temporalClusteringResult = {
    detected: false,
    score: 0,
  };

  // Create risk analysis
  const riskAnalysis = createAccountRiskAnalysis(account.id, account.username, {
    accountAge: accountAgeResult,
    namePattern: namePatternResult,
    emailPattern: emailPatternResult,
    singleRepo: singleRepoResult,
    coordinatedBehaviour: coordinatedBehaviourResult,
    temporalClustering: temporalClusteringResult,
  });

  return riskAnalysis;
}

/**
 * Analyze multiple accounts in a repository context
 */
export async function analyzeRepository(repositoryId: string): Promise<{
  accountAnalyses: AccountRiskAnalysis[];
  clusters: any[];
}> {
  // Get all comments for the repository with account info
  const comments = await prisma.comment.findMany({
    where: { repositoryId },
    include: {
      account: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });

  if (comments.length === 0) {
    return { accountAnalyses: [], clusters: [] };
  }

  // Get unique accounts
  const uniqueAccounts = new Map<string, (typeof comments)[0]['account']>();
  comments.forEach(comment => {
    if (!uniqueAccounts.has(comment.account.id)) {
      uniqueAccounts.set(comment.account.id, comment.account);
    }
  });

  const accounts = Array.from(uniqueAccounts.values());

  // Prepare data for cross-account analysis
  const commentData = comments.map(c => ({
    username: c.account.username,
    content: c.content,
    createdAt: c.createdAt,
    commentId: c.id,
  }));

  // Run coordinated behaviour detection across all accounts
  const coordinatedResult = detectCoordinatedBehaviour(commentData);

  // Run temporal clustering detection
  const temporalResult = detectTemporalClustering(commentData);

  // Analyze each account
  const accountAnalyses: AccountRiskAnalysis[] = [];

  for (const account of accounts) {
    const accountComments = comments.filter(c => c.accountId === account.id);

    // Individual detections
    const accountAgeResult = detectAccountAge(account.createdAt);
    const namePatternResult = detectNamePattern(account.username);
    const emailPatternResult = detectEmailPattern(account.email);

    // Repository activity
    const repositoryActivity = calculateRepositoryActivity(accountComments);
    const singleRepoResult = detectSingleRepositoryActivity(repositoryActivity);

    // For coordinated behaviour, check if this account is in any clusters
    let coordinatedScore = 0;
    if (coordinatedResult.details?.networkClusters) {
      const inCluster = coordinatedResult.details.networkClusters.clusters.some(
        (cluster: { accounts: string[] }) => cluster.accounts.includes(account.username)
      );
      if (inCluster) {
        coordinatedScore = coordinatedResult.score;
      }
    }

    // For temporal clustering, check if account is in clusters
    let temporalScore = 0;
    if (temporalResult.details?.clusters) {
      const inTemporalCluster = temporalResult.details.clusters.some(
        (cluster: { accounts: string[] }) => cluster.accounts.includes(account.username)
      );
      if (inTemporalCluster) {
        temporalScore = temporalResult.score;
      }
    }

    // Create risk analysis
    const riskAnalysis = createAccountRiskAnalysis(account.id, account.username, {
      accountAge: accountAgeResult,
      namePattern: namePatternResult,
      emailPattern: emailPatternResult,
      singleRepo: singleRepoResult,
      coordinatedBehaviour: {
        detected: coordinatedScore > 40,
        score: coordinatedScore,
        reason: coordinatedScore > 40 ? coordinatedResult.reason : undefined,
      },
      temporalClustering: {
        detected: temporalScore > 40,
        score: temporalScore,
        reason: temporalScore > 40 ? temporalResult.reason : undefined,
      },
    });

    accountAnalyses.push(riskAnalysis);
  }

  // Extract cluster information
  const clusters = [];

  if (coordinatedResult.details?.networkClusters) {
    clusters.push(
      ...coordinatedResult.details.networkClusters.clusters.map((cluster: any) => ({
        type: 'network',
        accounts: cluster.accounts,
        strength: cluster.strength,
        score: cluster.score,
      }))
    );
  }

  if (temporalResult.details?.clusters) {
    clusters.push(
      ...temporalResult.details.clusters.map((cluster: any) => ({
        type: 'temporal',
        accounts: cluster.accounts,
        timeWindow: {
          start: cluster.startTime,
          end: cluster.endTime,
        },
        score: 0, // Computed in detection
      }))
    );
  }

  return {
    accountAnalyses,
    clusters,
  };
}

/**
 * Save analysis results to database
 */
export async function saveAnalysisResults(
  analysisId: string,
  accountAnalyses: AccountRiskAnalysis[]
): Promise<void> {
  // Save account analysis results
  for (const analysis of accountAnalyses) {
    await prisma.accountAnalysis.create({
      data: {
        analysisId,
        accountId: analysis.accountId,
        riskScore: analysis.riskScore,
        detections: analysis.detections as any,
      },
    });

    // Update account risk score
    await prisma.account.update({
      where: { id: analysis.accountId },
      data: {
        riskScore: analysis.riskScore,
        flagReasons: analysis.flagReasons,
        lastAnalysedAt: new Date(),
      },
    });
  }
}
