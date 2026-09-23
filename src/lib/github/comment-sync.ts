import { prisma } from '@/lib/db';
import type { GitHubAPIClient } from './api-client';
import { storeComment, upsertAccount } from './store';

const DEFAULT_BACKFILL_DAYS = 90;
const MAX_COMMENTS_PER_KIND = 1000;

/**
 * Backfill a repository's recent comment history from the GitHub API, so analyses
 * also cover comments made before the app was installed or while webhooks were missed.
 * Incremental after the first run.
 */
export async function syncRepositoryComments(
  client: GitHubAPIClient,
  repository: { id: string; fullName: string; commentsSyncedAt: Date | null },
  now: Date = new Date()
): Promise<number> {
  const [owner, repo] = repository.fullName.split('/');
  const since =
    repository.commentsSyncedAt ??
    new Date(now.getTime() - DEFAULT_BACKFILL_DAYS * 24 * 60 * 60 * 1000);

  const comments = await client.getRepositoryComments(owner, repo, {
    since,
    maxPerKind: MAX_COMMENTS_PER_KIND,
  });

  let stored = 0;
  for (const comment of comments) {
    if (!comment.user || comment.user.type === 'Bot') continue;

    const account = await upsertAccount(comment.user);
    await storeComment({
      kind: comment.kind,
      githubId: comment.id,
      accountId: account.id,
      repositoryId: repository.id,
      body: comment.body,
      createdAt: comment.createdAt,
      issueNumber: comment.issueNumber,
      prNumber: comment.prNumber,
    });
    stored++;
  }

  await prisma.repository.update({
    where: { id: repository.id },
    data: { commentsSyncedAt: now },
  });

  return stored;
}
