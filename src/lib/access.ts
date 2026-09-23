import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { JWT } from 'next-auth/jwt';
import { getGitHubApiUrl } from '@/lib/github/api-url';

export interface Viewer {
  login: string;
  githubId?: number;
  accessToken: string;
  isAdmin: boolean;
}

/**
 * The viewer's GitHub token was rejected (expired or revoked): they need to sign in again
 */
export class GitHubAuthError extends Error {
  constructor() {
    super('GitHub rejected the user access token');
    this.name = 'GitHubAuthError';
  }
}

const ACCESS_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_PAGES = 20;

/**
 * GitHub logins (comma-separated in ADMIN_GITHUB_LOGINS) that can see every repository
 */
export function getAdminLogins(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    (env.ADMIN_GITHUB_LOGINS ?? '')
      .split(',')
      .map(login => login.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function viewerFromToken(token: JWT | null): Viewer | null {
  if (!token?.accessToken || !token.login || token.error) return null;

  return {
    login: token.login,
    githubId: token.githubId,
    accessToken: token.accessToken,
    isAdmin: getAdminLogins().has(token.login.toLowerCase()),
  };
}

async function githubGetAll<T>(path: string, accessToken: string, key: string): Promise<T[]> {
  const items: T[] = [];
  let url: string | null = `${getGitHubApiUrl()}${path}?per_page=100`;

  for (let page = 0; url && page < MAX_PAGES; page++) {
    const response: Response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    });

    if (response.status === 401) {
      throw new GitHubAuthError();
    }

    if (response.status === 403) {
      throw new Error(
        `GitHub refused ${path} (403). Sign-in must use the GitHub App's own client ID and ` +
          'secret (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET), not a separate OAuth App.'
      );
    }

    if (!response.ok) {
      throw new Error(`GitHub request ${path} failed: ${response.status}`);
    }

    const data = await response.json();
    items.push(...(data[key] ?? []));

    const next: RegExpMatchArray | null | undefined = response.headers
      .get('link')
      ?.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }

  return items;
}

const globalForAccess = globalThis as unknown as {
  accessCache?: Map<string, { expires: number; repositoryIds: Set<string> }>;
};
const accessCache = (globalForAccess.accessCache ??= new Map());

export function clearAccessCache() {
  accessCache.clear();
}

/**
 * GitHub IDs of the repositories the viewer can access through installations of this app
 */
export async function getAccessibleGitHubRepositoryIds(viewer: Viewer): Promise<Set<string>> {
  const cacheKey = crypto.createHash('sha256').update(viewer.accessToken).digest('hex');
  const cached = accessCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.repositoryIds;
  }

  const installations = await githubGetAll<{ id: number }>(
    '/user/installations',
    viewer.accessToken,
    'installations'
  );

  const repositoryIds = new Set<string>();
  for (const installation of installations) {
    const repositories = await githubGetAll<{ id: number }>(
      `/user/installations/${installation.id}/repositories`,
      viewer.accessToken,
      'repositories'
    );
    repositories.forEach(repository => repositoryIds.add(String(repository.id)));
  }

  // Drop expired entries so the cache can't grow without bound
  const now = Date.now();
  accessCache.forEach((entry, key) => {
    if (entry.expires <= now) accessCache.delete(key);
  });
  accessCache.set(cacheKey, { expires: now + ACCESS_CACHE_TTL_MS, repositoryIds });

  return repositoryIds;
}

/**
 * Prisma filter limiting repositories to those the viewer can access
 */
export async function repositoryAccessFilter(viewer: Viewer): Promise<Prisma.RepositoryWhereInput> {
  if (viewer.isAdmin) return {};

  const ids = await getAccessibleGitHubRepositoryIds(viewer);
  return { githubId: { in: Array.from(ids, id => BigInt(id)) } };
}
