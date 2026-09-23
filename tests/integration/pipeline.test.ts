import type { Job } from 'bullmq';
import { prisma } from '@/lib/db';
import type { GitHubAPIClient, RepositoryComment, UserEvent } from '@/lib/github/api-client';
import { requestRepositoryAnalysis, failStaleAnalyses } from '@/lib/analysis/service';
import { processCommentAnalysis, processRepositoryAnalysis } from '@/lib/queue/workers';
import { scheduleRepositoryAnalysis, queueRepositoryAnalysis } from '@/lib/queue/setup';
import { storeComment, upsertAccount, upsertRepository } from '@/lib/github/store';
import { resetDatabase } from './helpers';

jest.mock('@/lib/queue/setup', () => ({
  ...jest.requireActual('@/lib/queue/setup'),
  scheduleRepositoryAnalysis: jest.fn().mockResolvedValue({ id: 'scheduled' }),
  queueRepositoryAnalysis: jest.fn().mockResolvedValue({ id: 'queued' }),
}));

const mockCreateClient = jest.fn();
jest.mock('@/lib/github/api-client', () => ({
  createGitHubClient: (installationId: number) => mockCreateClient(installationId),
}));

const DAY = 24 * 60 * 60 * 1000;
const INSTALLATION_ID = 777;

interface FakeUser {
  id: number;
  login: string;
  type: string;
  created_at: string;
  email: string | null;
}

class FakeGitHub {
  users = new Map<number, FakeUser>();
  events = new Map<string, UserEvent[]>();
  comments: RepositoryComment[] = [];
  failWith?: Error;
  calls = { getUserById: 0, getRepositoryComments: 0 };

  addUser(id: number, login: string, ageInDays: number, email: string | null = null) {
    this.users.set(id, {
      id,
      login,
      type: 'User',
      created_at: new Date(Date.now() - ageInDays * DAY).toISOString(),
      email,
    });
  }

  async getUserById(accountId: number) {
    this.calls.getUserById++;
    if (this.failWith) throw this.failWith;
    const user = this.users.get(accountId);
    if (!user) throw Object.assign(new Error('Not Found'), { status: 404 });
    return user;
  }

  async getUserPublicEvents(username: string) {
    return this.events.get(username) ?? [];
  }

  async getRepositoryComments() {
    this.calls.getRepositoryComments++;
    if (this.failWith) throw this.failWith;
    return this.comments;
  }
}

let github: FakeGitHub;

function fakeJob<T>(data: T) {
  const job = {
    id: 'job-1',
    data,
    updateData: jest.fn(async (next: T) => {
      job.data = next;
    }),
  };
  return job as unknown as Job<T> & { updateData: jest.Mock };
}

async function createRepository() {
  return upsertRepository({ id: 5001, full_name: 'octo-org/widgets' }, INSTALLATION_ID);
}

async function addStoredComment(
  repositoryId: string,
  user: { id: number; login: string },
  githubId: number,
  body: string,
  createdAt: Date
) {
  const account = await upsertAccount(user);
  return storeComment({
    kind: 'issue_comment',
    githubId,
    accountId: account.id,
    repositoryId,
    body,
    createdAt: createdAt.toISOString(),
    issueNumber: 42,
  });
}

beforeEach(async () => {
  await resetDatabase();
  github = new FakeGitHub();
  mockCreateClient.mockReset();
  mockCreateClient.mockResolvedValue(github as unknown as GitHubAPIClient);
  jest.mocked(scheduleRepositoryAnalysis).mockClear();
  jest.mocked(queueRepositoryAnalysis).mockClear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('comment analysis job', () => {
  it("syncs the author's profile and schedules a repository analysis", async () => {
    const repo = await createRepository();
    github.addUser(9001, 'jigar123', 3, 'jigar123@mailinator.com');
    github.events.set('jigar123', [
      { type: 'IssueCommentEvent', repo: { name: 'octo-org/widgets' }, created_at: null },
      { type: 'IssueCommentEvent', repo: { name: 'octo-org/widgets' }, created_at: null },
    ]);
    const comment = await addStoredComment(
      repo.id,
      { id: 9001, login: 'jigar123' },
      1,
      'Please merge',
      new Date()
    );

    const result = await processCommentAnalysis(
      fakeJob({
        commentId: comment.id,
        accountId: comment.accountId,
        repositoryId: repo.id,
        installationId: INSTALLATION_ID,
      })
    );

    expect(result).toMatchObject({ profile: 'synced' });
    expect(mockCreateClient).toHaveBeenCalledWith(INSTALLATION_ID);
    expect(scheduleRepositoryAnalysis).toHaveBeenCalledWith(repo.id);

    const account = await prisma.account.findUniqueOrThrow({ where: { id: comment.accountId } });
    expect(account.createdAt).not.toBeNull();
    expect(account.email).toBe('jigar123@mailinator.com');
    expect(account.profileSyncedAt).not.toBeNull();
    expect(account.activitySummary).toMatchObject({
      eventsSampled: 2,
      repositories: [{ name: 'octo-org/widgets', events: 2 }],
    });
  });

  it('does not re-fetch a recently synced profile', async () => {
    const repo = await createRepository();
    const comment = await addStoredComment(
      repo.id,
      { id: 9002, login: 'alice' },
      2,
      'Hi',
      new Date()
    );
    await prisma.account.update({
      where: { id: comment.accountId },
      data: { profileSyncedAt: new Date() },
    });

    const result = await processCommentAnalysis(
      fakeJob({
        commentId: comment.id,
        accountId: comment.accountId,
        repositoryId: repo.id,
        installationId: INSTALLATION_ID,
      })
    );

    expect(result).toMatchObject({ profile: 'fresh' });
    expect(github.calls.getUserById).toBe(0);
    expect(scheduleRepositoryAnalysis).toHaveBeenCalledWith(repo.id);
  });

  it('records deleted GitHub accounts without failing', async () => {
    const repo = await createRepository();
    const comment = await addStoredComment(
      repo.id,
      { id: 9003, login: 'ghost' },
      3,
      'Hi',
      new Date()
    );

    const result = await processCommentAnalysis(
      fakeJob({
        commentId: comment.id,
        accountId: comment.accountId,
        repositoryId: repo.id,
        installationId: INSTALLATION_ID,
      })
    );

    expect(result).toMatchObject({ profile: 'not_found' });
    const account = await prisma.account.findUniqueOrThrow({ where: { id: comment.accountId } });
    expect(account.profileSyncedAt).not.toBeNull();
  });

  it('skips comments that were deleted before the job ran', async () => {
    const result = await processCommentAnalysis(
      fakeJob({
        commentId: 'missing',
        accountId: 'missing',
        repositoryId: 'missing',
        installationId: INSTALLATION_ID,
      })
    );

    expect(result).toEqual({ skipped: 'Comment no longer exists' });
    expect(scheduleRepositoryAnalysis).not.toHaveBeenCalled();
  });
});

describe('repository analysis job', () => {
  function seedSockPuppetCampaign() {
    const now = Date.now();
    const puppets = [
      { id: 7001, login: 'user1234' },
      { id: 7002, login: 'user5678' },
      { id: 7003, login: 'test4321' },
    ];

    puppets.forEach(p => github.addUser(p.id, p.login, 3, `${p.login}@mailinator.com`));
    github.addUser(7100, 'longtime-maintainer', 3000);

    github.comments = [
      ...puppets.map((p, i) => ({
        kind: 'issue_comment' as const,
        id: 100 + i,
        body: 'The maintainer is too slow, please merge this patch now',
        createdAt: new Date(now - (60 - i * 5) * 60 * 1000).toISOString(),
        user: { id: p.id, login: p.login, type: 'User' },
        issueNumber: 42,
      })),
      {
        kind: 'review_comment' as const,
        id: 200,
        body: 'I will review this properly when I have time',
        createdAt: new Date(now - 10 * DAY).toISOString(),
        user: { id: 7100, login: 'longtime-maintainer', type: 'User' },
        prNumber: 43,
      },
      {
        kind: 'issue_comment' as const,
        id: 300,
        body: 'Bumps lodash from 4.17.20 to 4.17.21',
        createdAt: new Date(now - DAY).toISOString(),
        user: { id: 49699333, login: 'dependabot[bot]', type: 'Bot' },
        issueNumber: 44,
      },
    ];
  }

  it('backfills comments, syncs profiles, saves results and raises an alert', async () => {
    const repo = await createRepository();
    seedSockPuppetCampaign();

    const { analysis } = await requestRepositoryAnalysis(repo.id);
    expect(analysis.status).toBe('pending');
    expect(queueRepositoryAnalysis).toHaveBeenCalledWith({
      repositoryId: repo.id,
      triggeredBy: 'manual',
      analysisId: analysis.id,
    });

    const result = await processRepositoryAnalysis(
      fakeJob({ repositoryId: repo.id, triggeredBy: 'manual' as const, analysisId: analysis.id })
    );

    expect(result).toMatchObject({ analysisId: analysis.id, commentsSynced: 4, profilesSynced: 4 });

    // Bot comments are not stored
    expect(await prisma.comment.count()).toBe(4);
    const reviewComment = await prisma.comment.findFirstOrThrow({
      where: { kind: 'review_comment' },
    });
    expect(reviewComment.prNumber).toBe(43);

    const saved = await prisma.analysis.findUniqueOrThrow({
      where: { id: analysis.id },
      include: { accountResults: { include: { account: true } } },
    });
    expect(saved.status).toBe('completed');
    expect(saved.completedAt).not.toBeNull();
    expect(saved.accountResults).toHaveLength(4);
    expect(saved.detectedClusters.length).toBeGreaterThan(0);

    const scores = Object.fromEntries(
      saved.accountResults.map(r => [r.account.username, r.riskScore])
    );
    expect(scores['user1234']).toBeGreaterThan(scores['longtime-maintainer']);

    const account = await prisma.account.findUniqueOrThrow({ where: { username: 'user1234' } });
    expect(account.riskScore).toBe(scores['user1234']);
    expect(account.lastAnalysedAt).not.toBeNull();

    const alerts = await prisma.alert.findMany();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toMatch(/high|critical/);
    expect(alerts[0].accountsInvolved).toContain(account.id);
    expect(alerts[0].description).toContain('user1234');
  });

  it('does not raise duplicate alerts on repeat analyses', async () => {
    const repo = await createRepository();
    seedSockPuppetCampaign();

    await processRepositoryAnalysis(
      fakeJob({ repositoryId: repo.id, triggeredBy: 'manual' as const })
    );
    await processRepositoryAnalysis(
      fakeJob({ repositoryId: repo.id, triggeredBy: 'manual' as const })
    );

    expect(await prisma.analysis.count({ where: { status: 'completed' } })).toBe(2);
    expect(await prisma.alert.count()).toBe(1);
  });

  it('only backfills from GitHub on the first webhook-triggered run', async () => {
    const repo = await createRepository();
    seedSockPuppetCampaign();

    await processRepositoryAnalysis(
      fakeJob({ repositoryId: repo.id, triggeredBy: 'webhook' as const })
    );
    await processRepositoryAnalysis(
      fakeJob({ repositoryId: repo.id, triggeredBy: 'webhook' as const })
    );

    expect(github.calls.getRepositoryComments).toBe(1);
  });

  it('marks the analysis failed, rethrows for retry, and reuses the record on retry', async () => {
    const repo = await createRepository();
    github.failWith = new Error('GitHub API unavailable');

    const job = fakeJob({ repositoryId: repo.id, triggeredBy: 'webhook' as const });
    await expect(processRepositoryAnalysis(job)).rejects.toThrow('GitHub API unavailable');

    const failed = await prisma.analysis.findFirstOrThrow();
    expect(failed.status).toBe('failed');
    expect(failed.errorMessage).toBe('GitHub API unavailable');
    expect(job.updateData).toHaveBeenCalledWith(expect.objectContaining({ analysisId: failed.id }));

    // Retry succeeds with the same analysis record
    github.failWith = undefined;
    await processRepositoryAnalysis(job);

    expect(await prisma.analysis.count()).toBe(1);
    expect((await prisma.analysis.findFirstOrThrow()).status).toBe('completed');
  });

  it('skips repositories that were removed before the job ran', async () => {
    const result = await processRepositoryAnalysis(
      fakeJob({ repositoryId: 'removed', triggeredBy: 'webhook' as const })
    );

    expect(result).toEqual({ skipped: 'Repository no longer exists' });
    expect(await prisma.analysis.count()).toBe(0);
  });
});

describe('manual analysis requests', () => {
  it('returns the running analysis instead of starting another', async () => {
    const repo = await createRepository();

    const first = await requestRepositoryAnalysis(repo.id);
    const second = await requestRepositoryAnalysis(repo.id);

    expect(second.alreadyRunning).toBe(true);
    expect(second.analysis.id).toBe(first.analysis.id);
    expect(queueRepositoryAnalysis).toHaveBeenCalledTimes(1);
  });

  it('times out analyses stuck in progress so a new one can start', async () => {
    const repo = await createRepository();
    const stuck = await prisma.analysis.create({
      data: {
        repositoryId: repo.id,
        triggeredBy: 'manual',
        status: 'processing',
        startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    });

    await failStaleAnalyses(repo.id);
    const { analysis, alreadyRunning } = await requestRepositoryAnalysis(repo.id);

    expect(alreadyRunning).toBe(false);
    expect(analysis.id).not.toBe(stuck.id);
    expect((await prisma.analysis.findUniqueOrThrow({ where: { id: stuck.id } })).status).toBe(
      'failed'
    );
  });

  it('marks the analysis failed if it cannot be queued', async () => {
    const repo = await createRepository();
    jest.mocked(queueRepositoryAnalysis).mockRejectedValueOnce(new Error('Redis down'));

    await expect(requestRepositoryAnalysis(repo.id)).rejects.toThrow('Redis down');
    expect((await prisma.analysis.findFirstOrThrow()).status).toBe('failed');
  });
});
