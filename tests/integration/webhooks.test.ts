import { POST } from '@/app/api/webhooks/github/route';
import { prisma } from '@/lib/db';
import { queueCommentAnalysis } from '@/lib/queue/setup';
import {
  installation,
  issueCommentPayload,
  repository,
  resetDatabase,
  signedWebhookRequest,
  webhookUser,
} from './helpers';

jest.mock('@/lib/queue/setup', () => ({
  queueCommentAnalysis: jest.fn().mockResolvedValue({ id: 'job-1' }),
}));

const mockedQueue = jest.mocked(queueCommentAnalysis);

async function send(event: string, payload: unknown) {
  const response = await POST(signedWebhookRequest(event, payload));
  return { status: response.status, body: await response.json() };
}

beforeEach(async () => {
  await resetDatabase();
  mockedQueue.mockClear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GitHub webhook endpoint', () => {
  it('rejects requests with an invalid signature', async () => {
    const response = await POST(
      signedWebhookRequest('issue_comment', issueCommentPayload('created'), 'wrong-secret')
    );

    expect(response.status).toBe(401);
  });

  it('rejects malformed JSON with a 400', async () => {
    const { status } = await send('issue_comment', '{not json');

    expect(status).toBe(400);
  });

  it('answers ping events', async () => {
    const { status, body } = await send('ping', { zen: 'Keep it logically awesome.' });

    expect(status).toBe(200);
    expect(body.received).toBe(true);
  });

  it('stores a comment from a first-time commenter (webhook user has no created_at)', async () => {
    const { status, body } = await send(
      'issue_comment',
      issueCommentPayload('created', { commentId: 101 })
    );

    expect(status).toBe(200);
    expect(body.status).toBe('stored');

    const account = await prisma.account.findUniqueOrThrow({ where: { githubId: 90001 } });
    expect(account.username).toBe('jigar123');
    expect(account.createdAt).toBeNull();

    const comment = await prisma.comment.findFirstOrThrow({ include: { repository: true } });
    expect(comment.kind).toBe('issue_comment');
    expect(comment.githubId).toBe(BigInt(101));
    expect(comment.issueNumber).toBe(42);
    expect(comment.repository.fullName).toBe('octo-org/widgets');
    expect(comment.repository.installationId).toBe(installation.id);

    // The job must reference the database comment ID, not GitHub's
    expect(mockedQueue).toHaveBeenCalledWith({
      commentId: comment.id,
      accountId: account.id,
      repositoryId: comment.repositoryId,
      installationId: installation.id,
    });
  });

  it('stores comment IDs larger than a 32-bit integer', async () => {
    const commentId = 3_000_000_123;
    const { status } = await send('issue_comment', issueCommentPayload('created', { commentId }));

    expect(status).toBe(200);
    const comment = await prisma.comment.findFirstOrThrow();
    expect(comment.githubId).toBe(BigInt(commentId));
  });

  it('ignores comments written by bots', async () => {
    const { body } = await send(
      'issue_comment',
      issueCommentPayload('created', {
        commentId: 7,
        user: webhookUser('dependabot[bot]', 49699333, 'Bot'),
      })
    );

    expect(body.status).toBe('ignored');
    expect(await prisma.comment.count()).toBe(0);
    expect(mockedQueue).not.toHaveBeenCalled();
  });

  it('updates edited comments and removes deleted ones', async () => {
    await send('issue_comment', issueCommentPayload('created', { commentId: 55 }));
    await send(
      'issue_comment',
      issueCommentPayload('edited', { commentId: 55, body: 'Edited text' })
    );

    expect((await prisma.comment.findFirstOrThrow()).content).toBe('Edited text');

    const { body } = await send('issue_comment', issueCommentPayload('deleted', { commentId: 55 }));
    expect(body.status).toBe('deleted');
    expect(await prisma.comment.count()).toBe(0);
  });

  it('keeps issue comments and review comments with the same numeric ID apart', async () => {
    await send('issue_comment', issueCommentPayload('created', { commentId: 999 }));
    await send('pull_request_review_comment', {
      action: 'created',
      pull_request: { number: 43, title: 'Add feature', state: 'open' },
      comment: {
        id: 999,
        body: 'Looks good',
        created_at: '2026-09-01T11:00:00Z',
        updated_at: '2026-09-01T11:00:00Z',
        user: webhookUser('dennis4545', 90002),
      },
      repository,
      installation,
    });

    const comments = await prisma.comment.findMany({ orderBy: { kind: 'asc' } });
    expect(comments.map(c => c.kind)).toEqual(['issue_comment', 'review_comment']);
    expect(comments[1].prNumber).toBe(43);
  });

  it('handles concurrent first comments from the same new account', async () => {
    const results = await Promise.all(
      [201, 202, 203].map(commentId =>
        send('issue_comment', issueCommentPayload('created', { commentId }))
      )
    );

    expect(results.map(r => r.status)).toEqual([200, 200, 200]);
    expect(await prisma.account.count()).toBe(1);
    expect(await prisma.repository.count()).toBe(1);
    expect(await prisma.comment.count()).toBe(3);
  });

  it('follows username changes and frees a reused username', async () => {
    await send(
      'issue_comment',
      issueCommentPayload('created', { commentId: 1, user: webhookUser('old-name', 500) })
    );
    await send(
      'issue_comment',
      issueCommentPayload('created', { commentId: 2, user: webhookUser('new-name', 500) })
    );
    // A different account later takes the freed name
    await send(
      'issue_comment',
      issueCommentPayload('created', { commentId: 3, user: webhookUser('new-name', 501) })
    );

    const accounts = await prisma.account.findMany({ orderBy: { githubId: 'asc' } });
    expect(accounts.map(a => [a.githubId, a.username])).toEqual([
      [500, 'new-name#stale-500'],
      [501, 'new-name'],
    ]);
  });

  it('registers repositories on installation, idempotently', async () => {
    const payload = {
      action: 'created',
      installation: {
        id: installation.id,
        account: { login: 'octo-org', id: 1, type: 'Organization' },
        target_type: 'Organization',
        permissions: { issues: 'read', metadata: 'read', pull_requests: 'read' },
      },
      repositories: [
        { id: 11, full_name: 'octo-org/one', name: 'one', private: false },
        { id: 12, full_name: 'octo-org/two', name: 'two', private: true },
      ],
    };

    expect((await send('installation', payload)).status).toBe(200);
    // Redelivery must not fail on unique constraints
    expect((await send('installation', payload)).status).toBe(200);

    const stored = await prisma.installation.findUniqueOrThrow({
      where: { githubInstallationId: installation.id },
    });
    expect(stored.accountLogin).toBe('octo-org');
    expect(stored.accountType).toBe('Organization');
    expect(await prisma.repository.count()).toBe(2);
  });

  it('removes repositories, their data and orphaned accounts on uninstall', async () => {
    await send('issue_comment', issueCommentPayload('created', { commentId: 77 }));
    expect(await prisma.account.count()).toBe(1);

    const { status } = await send('installation', {
      action: 'deleted',
      installation: {
        id: installation.id,
        account: { login: 'octo-org', id: 1, type: 'Organization' },
        target_type: 'Organization',
        permissions: {},
      },
    });

    expect(status).toBe(200);
    expect(await prisma.repository.count()).toBe(0);
    expect(await prisma.comment.count()).toBe(0);
    expect(await prisma.account.count()).toBe(0);
  });

  it('adds and removes repositories when the installation selection changes', async () => {
    const base = {
      installation: { id: installation.id },
      repository_selection: 'selected',
      repositories_added: [] as unknown[],
      repositories_removed: [] as unknown[],
    };

    await send('installation_repositories', {
      ...base,
      action: 'added',
      repositories_added: [{ id: 21, full_name: 'octo-org/three', name: 'three' }],
    });
    expect(await prisma.repository.count()).toBe(1);

    await send('installation_repositories', {
      ...base,
      action: 'removed',
      repositories_removed: [{ id: 21, full_name: 'octo-org/three', name: 'three' }],
    });
    expect(await prisma.repository.count()).toBe(0);
  });
});
