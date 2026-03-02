import { Octokit } from '@octokit/rest';
import { getInstallationOctokit } from './app-auth';

/**
 * GitHub API client wrapper with rate limiting and error handling
 */
export class GitHubAPIClient {
  private octokit!: Octokit;
  private installationId: number;

  constructor(installationId: number, octokit?: Octokit) {
    this.installationId = installationId;
    if (octokit) {
      this.octokit = octokit;
    }
  }

  /**
   * Initialize the Octokit instance
   */
  private async getOctokit(): Promise<Octokit> {
    if (!this.octokit) {
      this.octokit = await getInstallationOctokit(this.installationId);
    }
    return this.octokit;
  }

  /**
   * Get user information
   */
  async getUser(username: string) {
    const octokit = await this.getOctokit();
    try {
      const { data } = await octokit.users.getByUsername({ username });
      return data;
    } catch (error) {
      console.error(`Failed to fetch user ${username}:`, error);
      throw error;
    }
  }

  /**
   * Get repository information
   */
  async getRepository(owner: string, repo: string) {
    const octokit = await this.getOctokit();
    try {
      const { data } = await octokit.repos.get({ owner, repo });
      return data;
    } catch (error) {
      console.error(`Failed to fetch repository ${owner}/${repo}:`, error);
      throw error;
    }
  }

  /**
   * Get issue comments for a repository
   */
  async getIssueComments(owner: string, repo: string, issueNumber: number) {
    const octokit = await this.getOctokit();
    try {
      const { data } = await octokit.issues.listComments({
        owner,
        repo,
        issue_number: issueNumber,
        per_page: 100,
      });
      return data;
    } catch (error) {
      console.error(`Failed to fetch comments for ${owner}/${repo}#${issueNumber}:`, error);
      throw error;
    }
  }

  /**
   * Get pull request review comments
   */
  async getPullRequestReviewComments(owner: string, repo: string, pullNumber: number) {
    const octokit = await this.getOctokit();
    try {
      const { data } = await octokit.pulls.listReviewComments({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
      });
      return data;
    } catch (error) {
      console.error(
        `Failed to fetch review comments for ${owner}/${repo}#${pullNumber}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get all comments for a repository (issues + PRs)
   */
  async getAllComments(owner: string, repo: string, since?: Date) {
    const octokit = await this.getOctokit();
    const comments: any[] = [];

    try {
      // Get issue comments
      const issueCommentsIterator = octokit.paginate.iterator(octokit.issues.listCommentsForRepo, {
        owner,
        repo,
        since: since?.toISOString(),
        per_page: 100,
      });

      for await (const { data: issueComments } of issueCommentsIterator) {
        comments.push(...issueComments);
      }

      return comments;
    } catch (error) {
      console.error(`Failed to fetch all comments for ${owner}/${repo}:`, error);
      throw error;
    }
  }

  /**
   * Get user's contribution activity across repositories
   */
  async getUserEvents(username: string) {
    const octokit = await this.getOctokit();
    try {
      const { data } = await octokit.activity.listPublicEventsForUser({
        username,
        per_page: 100,
      });
      return data;
    } catch (error) {
      console.error(`Failed to fetch events for user ${username}:`, error);
      throw error;
    }
  }

  /**
   * Get rate limit status
   */
  async getRateLimit() {
    const octokit = await this.getOctokit();
    try {
      const { data } = await octokit.rateLimit.get();
      return data;
    } catch (error) {
      console.error('Failed to fetch rate limit:', error);
      throw error;
    }
  }
}

/**
 * Create a new GitHub API client for an installation
 */
export async function createGitHubClient(installationId: number): Promise<GitHubAPIClient> {
  return new GitHubAPIClient(installationId);
}
