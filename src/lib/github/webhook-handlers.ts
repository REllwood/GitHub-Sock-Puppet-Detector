import type { WebhookEventDefinition } from '@octokit/webhooks/types';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { queueCommentAnalysis } from '@/lib/queue/setup';

export type CommentKind = 'issue_comment' | 'review_comment';

export type IssueCommentEvent =
  | WebhookEventDefinition<'issue-comment-created'>
  | WebhookEventDefinition<'issue-comment-edited'>
  | WebhookEventDefinition<'issue-comment-deleted'>;

export type PullRequestReviewCommentEvent =
  | WebhookEventDefinition<'pull-request-review-comment-created'>
  | WebhookEventDefinition<'pull-request-review-comment-edited'>
  | WebhookEventDefinition<'pull-request-review-comment-deleted'>;

export type InstallationEvent =
  | WebhookEventDefinition<'installation-created'>
  | WebhookEventDefinition<'installation-deleted'>
  | WebhookEventDefinition<'installation-suspend'>
  | WebhookEventDefinition<'installation-unsuspend'>
  | WebhookEventDefinition<'installation-new-permissions-accepted'>;

export type InstallationRepositoriesEvent =
  | WebhookEventDefinition<'installation-repositories-added'>
  | WebhookEventDefinition<'installation-repositories-removed'>;

export interface WebhookResult {
  status: 'stored' | 'deleted' | 'ignored' | 'updated';
  reason?: string;
}

interface WebhookUser {
  id: number;
  login: string;
  type?: string;
}

interface WebhookRepository {
  id: number;
  full_name: string;
}

interface CommentEventInput {
  kind: CommentKind;
  action: string;
  comment: {
    id: number;
    body: string | null;
    created_at: string;
    user: WebhookUser | null;
  };
  repository: WebhookRepository;
  installationId?: number;
  issueNumber?: number;
  prNumber?: number;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Run an upsert, retrying once if a concurrent request created the same row first.
 */
async function withUniqueRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return operation();
    }
    throw error;
  }
}

/**
 * Create or update a repository. If another repository record still holds this name
 * (e.g. after a rename or transfer), its stale name is released first.
 */
export async function upsertRepository(repository: WebhookRepository, installationId: number) {
  const githubId = BigInt(repository.id);

  await prisma.repository.updateMany({
    where: { fullName: repository.full_name, NOT: { githubId } },
    data: { fullName: `${repository.full_name}#stale-${repository.id}` },
  });

  return withUniqueRetry(() =>
    prisma.repository.upsert({
      where: { githubId },
      create: {
        githubId,
        fullName: repository.full_name,
        installationId,
      },
      update: {
        fullName: repository.full_name,
        installationId,
      },
    })
  );
}

/**
 * Create or update an account from a webhook user. Webhook payloads only carry a minimal
 * user object (no creation date or email); the full profile is synced by the worker.
 */
export async function upsertAccount(user: WebhookUser) {
  const staleAccount = await prisma.account.findFirst({
    where: { username: user.login, NOT: { githubId: user.id } },
  });

  if (staleAccount) {
    await prisma.account.update({
      where: { id: staleAccount.id },
      data: { username: `${staleAccount.username}#stale-${staleAccount.githubId}` },
    });
  }

  return withUniqueRetry(() =>
    prisma.account.upsert({
      where: { githubId: user.id },
      create: {
        githubId: user.id,
        username: user.login,
        accountType: user.type ?? 'User',
        profileData: JSON.parse(JSON.stringify(user)),
      },
      update: {
        username: user.login,
        accountType: user.type ?? 'User',
      },
    })
  );
}

async function handleCommentEvent(input: CommentEventInput): Promise<WebhookResult> {
  const { kind, action, comment, repository } = input;
  const githubId = BigInt(comment.id);

  if (action === 'deleted') {
    const { count } = await prisma.comment.deleteMany({ where: { kind, githubId } });
    return count > 0 ? { status: 'deleted' } : { status: 'ignored', reason: 'Comment not stored' };
  }

  if (action !== 'created' && action !== 'edited') {
    return { status: 'ignored', reason: `Unhandled action: ${action}` };
  }

  if (!comment.user) {
    return { status: 'ignored', reason: 'Comment has no author' };
  }

  // GitHub Apps (dependabot, CI bots) cannot be sock puppets and would only add noise
  if (comment.user.type === 'Bot') {
    return { status: 'ignored', reason: 'Comment authored by a bot' };
  }

  let installationId = input.installationId;
  if (installationId === undefined) {
    const existing = await prisma.repository.findUnique({
      where: { githubId: BigInt(repository.id) },
    });
    installationId = existing?.installationId;
  }

  if (installationId === undefined) {
    return { status: 'ignored', reason: 'No installation associated with repository' };
  }

  const repo = await upsertRepository(repository, installationId);
  const account = await upsertAccount(comment.user);

  const stored = await withUniqueRetry(() =>
    prisma.comment.upsert({
      where: { kind_githubId: { kind, githubId } },
      create: {
        githubId,
        kind,
        accountId: account.id,
        repositoryId: repo.id,
        content: comment.body ?? '',
        createdAt: new Date(comment.created_at),
        issueNumber: input.issueNumber,
        prNumber: input.prNumber,
      },
      update: {
        content: comment.body ?? '',
      },
    })
  );

  await queueCommentAnalysis({
    commentId: stored.id,
    accountId: account.id,
    repositoryId: repo.id,
    installationId,
  });

  console.log(`Stored ${kind} ${comment.id} from ${comment.user.login} on ${repository.full_name}`);

  return { status: 'stored' };
}

export async function handleIssueComment(payload: IssueCommentEvent): Promise<WebhookResult> {
  return handleCommentEvent({
    kind: 'issue_comment',
    action: payload.action,
    comment: payload.comment,
    repository: payload.repository,
    installationId: payload.installation?.id,
    issueNumber: payload.issue.number,
  });
}

export async function handlePullRequestReviewComment(
  payload: PullRequestReviewCommentEvent
): Promise<WebhookResult> {
  return handleCommentEvent({
    kind: 'review_comment',
    action: payload.action,
    comment: payload.comment,
    repository: payload.repository,
    installationId: payload.installation?.id,
    prNumber: payload.pull_request.number,
  });
}

/**
 * Remove repositories (and, via cascades, their comments, analyses and alerts),
 * then remove accounts that no longer have any stored comments.
 */
async function removeRepositories(where: Prisma.RepositoryWhereInput) {
  const { count } = await prisma.repository.deleteMany({ where });
  await prisma.account.deleteMany({ where: { comments: { none: {} } } });
  return count;
}

export async function handleInstallation(payload: InstallationEvent): Promise<WebhookResult> {
  const { installation } = payload;

  switch (payload.action) {
    case 'created': {
      const account = installation.account as { login?: string; slug?: string; type?: string };
      const data = {
        accountType: account?.type ?? installation.target_type,
        accountLogin: account?.login ?? account?.slug ?? 'unknown',
        targetType: installation.target_type,
        permissions: JSON.parse(JSON.stringify(installation.permissions)),
      };

      await withUniqueRetry(() =>
        prisma.installation.upsert({
          where: { githubInstallationId: installation.id },
          create: { githubInstallationId: installation.id, ...data },
          update: data,
        })
      );

      for (const repository of payload.repositories ?? []) {
        await upsertRepository(repository, installation.id);
      }

      console.log(
        `Installation created: ${installation.id} (${payload.repositories?.length ?? 0} repositories)`
      );
      return { status: 'stored' };
    }

    case 'deleted': {
      await prisma.installation.deleteMany({
        where: { githubInstallationId: installation.id },
      });
      const removed = await removeRepositories({ installationId: installation.id });
      console.log(`Installation deleted: ${installation.id} (${removed} repositories removed)`);
      return { status: 'deleted' };
    }

    case 'new_permissions_accepted': {
      await prisma.installation.updateMany({
        where: { githubInstallationId: installation.id },
        data: { permissions: JSON.parse(JSON.stringify(installation.permissions)) },
      });
      return { status: 'updated' };
    }

    default:
      return { status: 'ignored', reason: `Unhandled installation action: ${payload.action}` };
  }
}

export async function handleInstallationRepositories(
  payload: InstallationRepositoriesEvent
): Promise<WebhookResult> {
  const installationId = payload.installation.id;

  if (payload.action === 'added') {
    for (const repository of payload.repositories_added) {
      await upsertRepository(repository, installationId);
    }
    console.log(`Added ${payload.repositories_added.length} repositories`);
    return { status: 'stored' };
  }

  const removed = await removeRepositories({
    githubId: { in: payload.repositories_removed.map(repository => BigInt(repository.id)) },
  });
  console.log(`Removed ${removed} repositories`);
  return { status: 'deleted' };
}
