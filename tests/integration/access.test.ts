import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { encode } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import IORedis from 'ioredis';
import { prisma } from '@/lib/db';
import { clearAccessCache } from '@/lib/access';
import { closeRateLimiter } from '@/lib/rate-limit';
import { GET as getRepositories } from '@/app/api/repositories/route';
import { GET as getAnalysis } from '@/app/api/analysis/[id]/route';
import { GET as getAccount } from '@/app/api/accounts/[username]/route';
import { POST as postAnalyse } from '@/app/api/analyse/[owner]/[repo]/route';
import { queueRepositoryAnalysis } from '@/lib/queue/setup';
import { resetDatabase } from './helpers';

jest.mock('@/lib/queue/setup', () => ({
  ...jest.requireActual('@/lib/queue/setup'),
  queueRepositoryAnalysis: jest.fn().mockResolvedValue({ id: 'queued' }),
}));

const SECRET = 'access-test-secret';

// Which installations and repositories each user token can see on (mock) GitHub
const githubAccess: Record<string, Record<number, number[]>> = {
  'tok-alice': { 1: [101] },
  'tok-bob': { 2: [202] },
  'tok-many': { 3: [301, 302, 303] },
};

let server: http.Server;
const githubRequests: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    githubRequests.push(url.pathname + url.search);
    const token = req.headers.authorization?.replace('Bearer ', '') ?? '';
    const access = githubAccess[token];

    const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(JSON.stringify(body));
    };

    if (!access) return send(401, { message: 'Bad credentials' });

    if (url.pathname === '/user/installations') {
      return send(200, { installations: Object.keys(access).map(id => ({ id: Number(id) })) });
    }

    const match = url.pathname.match(/^\/user\/installations\/(\d+)\/repositories$/);
    if (match) {
      const repositories = access[Number(match[1])] ?? [];
      // Serve one repository per page to exercise pagination
      const page = Number(url.searchParams.get('page') ?? '1');
      const base = `http://localhost:${(server.address() as AddressInfo).port}${url.pathname}`;
      const headers: Record<string, string> =
        page < repositories.length
          ? { link: `<${base}?per_page=100&page=${page + 1}>; rel="next"` }
          : {};
      return send(200, { repositories: [{ id: repositories[page - 1] }] }, headers);
    }

    send(404, { message: 'Not Found' });
  });

  await new Promise<void>(resolve => server.listen(0, resolve));
  process.env.GITHUB_API_URL = `http://localhost:${(server.address() as AddressInfo).port}`;
  process.env.NEXTAUTH_SECRET = SECRET;
  process.env.ADMIN_GITHUB_LOGINS = 'Boss';
  delete process.env.NEXTAUTH_URL;
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
  await closeRateLimiter();
  await prisma.$disconnect();
});

let ids: {
  repoA: string;
  repoB: string;
  analysisA: string;
  analysisB: string;
};

beforeEach(async () => {
  await resetDatabase();
  clearAccessCache();
  githubRequests.length = 0;
  jest.mocked(queueRepositoryAnalysis).mockClear();

  const repoA = await prisma.repository.create({
    data: { githubId: 101, fullName: 'org-a/app', installationId: 1 },
  });
  const repoB = await prisma.repository.create({
    data: { githubId: 202, fullName: 'org-b/secret', installationId: 2 },
  });

  const shared = await prisma.account.create({
    data: { githubId: 1, username: 'shared-user', profileData: {} },
  });
  const bOnly = await prisma.account.create({
    data: { githubId: 2, username: 'b-only-user', profileData: {} },
  });

  await prisma.comment.createMany({
    data: [
      {
        githubId: 1,
        kind: 'issue_comment',
        accountId: shared.id,
        repositoryId: repoA.id,
        content: 'Comment in A',
        createdAt: new Date(),
      },
      {
        githubId: 2,
        kind: 'issue_comment',
        accountId: shared.id,
        repositoryId: repoB.id,
        content: 'Private comment in B',
        createdAt: new Date(),
      },
      {
        githubId: 3,
        kind: 'issue_comment',
        accountId: bOnly.id,
        repositoryId: repoB.id,
        content: 'Only in B',
        createdAt: new Date(),
      },
    ],
  });

  const detections = (score: number) => ({
    accountAge: { detected: score > 30, score, reason: `score ${score}` },
    namePattern: { detected: false, score: 0 },
    emailPattern: { detected: false, score: 0 },
    singleRepo: { detected: false, score: 0 },
    coordinatedBehaviour: { detected: false, score: 0 },
    temporalClustering: { detected: false, score: 0 },
  });

  const analysisA = await prisma.analysis.create({
    data: {
      repositoryId: repoA.id,
      triggeredBy: 'manual',
      status: 'completed',
      accountResults: {
        create: [{ accountId: shared.id, riskScore: 10, detections: detections(10) }],
      },
    },
  });
  const analysisB = await prisma.analysis.create({
    data: {
      repositoryId: repoB.id,
      triggeredBy: 'manual',
      status: 'completed',
      accountResults: {
        create: [{ accountId: shared.id, riskScore: 95, detections: detections(95) }],
      },
    },
  });

  // Global fields reflect the latest analysis anywhere (repository B here)
  await prisma.account.update({
    where: { id: shared.id },
    data: { riskScore: 95, flagReasons: ['Age: from repository B'] },
  });

  ids = { repoA: repoA.id, repoB: repoB.id, analysisA: analysisA.id, analysisB: analysisB.id };
});

async function apiRequest(path: string, user?: { login: string; token: string }, method = 'GET') {
  const headers = new Headers();
  if (user) {
    const session = await encode({
      token: { sub: user.login, login: user.login, accessToken: user.token },
      secret: SECRET,
    });
    headers.set('cookie', `next-auth.session-token=${session}`);
  }
  return new NextRequest(`http://localhost:3000${path}`, { method, headers });
}

const alice = { login: 'alice', token: 'tok-alice' };
const bob = { login: 'bob', token: 'tok-bob' };
const admin = { login: 'boss', token: 'tok-unused' };

describe('API access control', () => {
  it('requires a session', async () => {
    const response = await getRepositories(await apiRequest('/api/repositories'));

    expect(response.status).toBe(401);
  });

  it("lists only repositories in the viewer's GitHub installations", async () => {
    const response = await getRepositories(await apiRequest('/api/repositories', alice));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.repositories.map((r: { fullName: string }) => r.fullName)).toEqual(['org-a/app']);
    // GitHub IDs are serialised as strings
    expect(body.repositories[0].githubId).toBe('101');
  });

  it('follows pagination when listing installation repositories', async () => {
    await prisma.repository.createMany({
      data: [301, 302, 303].map(id => ({
        githubId: id,
        fullName: `org-c/r${id}`,
        installationId: 3,
      })),
    });

    const response = await getRepositories(
      await apiRequest('/api/repositories', { login: 'many', token: 'tok-many' })
    );
    const body = await response.json();

    expect(body.repositories).toHaveLength(3);
    expect(githubRequests.filter(r => r.startsWith('/user/installations/3/'))).toHaveLength(3);
  });

  it('lets configured admins see every repository', async () => {
    const response = await getRepositories(await apiRequest('/api/repositories', admin));
    const body = await response.json();

    expect(body.repositories).toHaveLength(2);
    expect(githubRequests).toHaveLength(0);
  });

  it("hides analyses of repositories the viewer can't access", async () => {
    const hidden = await getAnalysis(await apiRequest(`/api/analysis/${ids.analysisB}`, alice), {
      params: { id: ids.analysisB },
    });
    const visible = await getAnalysis(await apiRequest(`/api/analysis/${ids.analysisB}`, bob), {
      params: { id: ids.analysisB },
    });

    expect(hidden.status).toBe(404);
    expect(visible.status).toBe(200);
  });

  it("won't start analyses of repositories the viewer can't access", async () => {
    const params = { params: { owner: 'org-b', repo: 'secret' } };

    const denied = await postAnalyse(
      await apiRequest('/api/analyse/org-b/secret', alice, 'POST'),
      params
    );
    const allowed = await postAnalyse(
      await apiRequest('/api/analyse/org-b/secret', bob, 'POST'),
      params
    );

    expect(denied.status).toBe(404);
    expect(allowed.status).toBe(202);
    expect(queueRepositoryAnalysis).toHaveBeenCalledTimes(1);
  });

  it("scopes an account's comments and risk to the viewer's repositories", async () => {
    const response = await getAccount(await apiRequest('/api/accounts/shared-user', alice), {
      params: { username: 'shared-user' },
    });
    const { account } = await response.json();

    expect(response.status).toBe(200);
    expect(account.comments.map((c: { content: string }) => c.content)).toEqual(['Comment in A']);
    // Risk comes from repository A's analysis, not the global value set by repository B
    expect(account.riskScore).toBe(10);
    expect(account.flagReasons).toEqual([]);
    expect(account.analyses).toHaveLength(1);
  });

  it("hides accounts that only commented in repositories the viewer can't access", async () => {
    const response = await getAccount(await apiRequest('/api/accounts/b-only-user', alice), {
      params: { username: 'b-only-user' },
    });

    expect(response.status).toBe(404);
  });

  it('asks the user to sign in again when GitHub rejects their token', async () => {
    const response = await getRepositories(
      await apiRequest('/api/repositories', { login: 'mallory', token: 'tok-revoked' })
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error).toMatch(/sign in again/);
  });

  it('caches installation lookups between requests', async () => {
    await getRepositories(await apiRequest('/api/repositories', alice));
    await getRepositories(await apiRequest('/api/repositories', alice));

    expect(githubRequests.filter(r => r === '/user/installations?per_page=100')).toHaveLength(1);
  });
});

describe('API rate limiting', () => {
  const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

  afterAll(async () => {
    delete process.env.RATE_LIMIT_MAX_REQUESTS;
    await redis.quit();
  });

  it('returns 429 with Retry-After once the limit is reached', async () => {
    const keys = await redis.keys('ratelimit:user:alice:*');
    if (keys.length) await redis.del(...keys);
    process.env.RATE_LIMIT_MAX_REQUESTS = '3';

    const statuses = [];
    for (let i = 0; i < 4; i++) {
      const response = await getRepositories(await apiRequest('/api/repositories', alice));
      statuses.push(response.status);
      if (response.status === 429) {
        expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
      }
    }

    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});
