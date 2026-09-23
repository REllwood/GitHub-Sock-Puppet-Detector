import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export type CommentKind = 'issue_comment' | 'review_comment';

export interface GitHubUserRef {
  id: number;
  login: string;
  type?: string;
}

export interface GitHubRepositoryRef {
  id: number;
  full_name: string;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Run an upsert, retrying once if a concurrent request created the same row first.
 */
export async function withUniqueRetry<T>(operation: () => Promise<T>): Promise<T> {
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
export async function upsertRepository(repository: GitHubRepositoryRef, installationId: number) {
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
export async function upsertAccount(user: GitHubUserRef) {
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

/**
 * Create or update a stored comment
 */
export async function storeComment(input: {
  kind: CommentKind;
  githubId: number;
  accountId: string;
  repositoryId: string;
  body: string | null;
  createdAt: string;
  issueNumber?: number;
  prNumber?: number;
}) {
  const githubId = BigInt(input.githubId);

  return withUniqueRetry(() =>
    prisma.comment.upsert({
      where: { kind_githubId: { kind: input.kind, githubId } },
      create: {
        githubId,
        kind: input.kind,
        accountId: input.accountId,
        repositoryId: input.repositoryId,
        content: input.body ?? '',
        createdAt: new Date(input.createdAt),
        issueNumber: input.issueNumber,
        prNumber: input.prNumber,
      },
      update: {
        content: input.body ?? '',
      },
    })
  );
}
