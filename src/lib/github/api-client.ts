import type { Octokit } from '@octokit/rest';
import { getInstallationOctokit } from './app-auth';

export interface RepositoryComment {
  kind: 'issue_comment' | 'review_comment';
  id: number;
  body: string;
  createdAt: string;
  user: { id: number; login: string; type?: string } | null;
  issueNumber?: number;
  prNumber?: number;
}

export interface UserEvent {
  type: string | null;
  repo: { name: string };
  created_at: string | null;
}

/**
 * Extract the trailing issue / pull request number from an API URL
 */
function numberFromUrl(url: string | undefined): number | undefined {
  const match = url?.match(/\/(\d+)$/);
  return match ? Number(match[1]) : undefined;
}

/**
 * GitHub API client wrapper for a single app installation
 */
export class GitHubAPIClient {
  private octokit?: Octokit;
  private installationId: number;

  constructor(installationId: number, octokit?: Octokit) {
    this.installationId = installationId;
    this.octokit = octokit;
  }

  private async getOctokit(): Promise<Octokit> {
    this.octokit ??= await getInstallationOctokit(this.installationId);
    return this.octokit;
  }

  /**
   * Get a user's full public profile
   */
  async getUser(username: string) {
    const octokit = await this.getOctokit();
    const { data } = await octokit.rest.users.getByUsername({ username });
    return data;
  }

  /**
   * Get a user's full public profile by their numeric ID (stable across username changes)
   */
  async getUserById(accountId: number) {
    const octokit = await this.getOctokit();
    const { data } = await octokit.rest.users.getById({ account_id: accountId });
    return data;
  }

  /**
   * Get a user's recent public events (GitHub keeps roughly the last 90 days)
   */
  async getUserPublicEvents(username: string, maxEvents = 100): Promise<UserEvent[]> {
    const octokit = await this.getOctokit();
    const { data } = await octokit.rest.activity.listPublicEventsForUser({
      username,
      per_page: Math.min(100, maxEvents),
    });
    return data.slice(0, maxEvents);
  }

  /**
   * Get issue comments and pull request review comments for a repository,
   * newest first, updated since the given date.
   */
  async getRepositoryComments(
    owner: string,
    repo: string,
    options: { since?: Date; maxPerKind?: number } = {}
  ): Promise<RepositoryComment[]> {
    const octokit = await this.getOctokit();
    const maxPerKind = options.maxPerKind ?? 1000;
    const since = options.since?.toISOString();
    const comments: RepositoryComment[] = [];

    let issueCount = 0;
    for await (const { data } of octokit.paginate.iterator(
      octokit.rest.issues.listCommentsForRepo,
      { owner, repo, since, sort: 'updated', direction: 'desc', per_page: 100 }
    )) {
      for (const comment of data) {
        if (issueCount >= maxPerKind) break;
        comments.push({
          kind: 'issue_comment',
          id: comment.id,
          body: comment.body ?? '',
          createdAt: comment.created_at,
          user: comment.user ?? null,
          issueNumber: numberFromUrl(comment.issue_url),
        });
        issueCount++;
      }
      if (issueCount >= maxPerKind) break;
    }

    let reviewCount = 0;
    for await (const { data } of octokit.paginate.iterator(
      octokit.rest.pulls.listReviewCommentsForRepo,
      { owner, repo, since, sort: 'updated', direction: 'desc', per_page: 100 }
    )) {
      for (const comment of data) {
        if (reviewCount >= maxPerKind) break;
        comments.push({
          kind: 'review_comment',
          id: comment.id,
          body: comment.body ?? '',
          createdAt: comment.created_at,
          user: comment.user ?? null,
          prNumber: numberFromUrl(comment.pull_request_url),
        });
        reviewCount++;
      }
      if (reviewCount >= maxPerKind) break;
    }

    return comments;
  }

  /**
   * Get rate limit status
   */
  async getRateLimit() {
    const octokit = await this.getOctokit();
    const { data } = await octokit.rest.rateLimit.get();
    return data;
  }
}

/**
 * Create a new GitHub API client for an installation
 */
export async function createGitHubClient(installationId: number): Promise<GitHubAPIClient> {
  return new GitHubAPIClient(installationId);
}
