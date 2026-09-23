import { prisma } from '@/lib/db';
import { analyseRepositoryAction, dismissAlertAction } from '@/app/dashboard/actions';
import { queueRepositoryAnalysis } from '@/lib/queue/setup';
import { requireViewer } from '@/lib/viewer';
import { resetDatabase } from './helpers';

jest.mock('@/lib/viewer', () => ({ requireViewer: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));
jest.mock('@/lib/queue/setup', () => ({
  ...jest.requireActual('@/lib/queue/setup'),
  queueRepositoryAnalysis: jest.fn().mockResolvedValue({ id: 'queued' }),
}));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { url });
  }),
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

let visibleRepo: string;
let hiddenRepo: string;

beforeEach(async () => {
  await resetDatabase();
  jest.mocked(queueRepositoryAnalysis).mockClear();

  visibleRepo = (
    await prisma.repository.create({
      data: { githubId: 1, fullName: 'org/visible', installationId: 1 },
    })
  ).id;
  hiddenRepo = (
    await prisma.repository.create({
      data: { githubId: 2, fullName: 'org/hidden', installationId: 2 },
    })
  ).id;

  jest.mocked(requireViewer).mockResolvedValue({
    viewer: { login: 'alice', accessToken: 'token', isAdmin: false },
    repositoryFilter: { githubId: { in: [BigInt(1)] } },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('dashboard server actions', () => {
  it('starts an analysis and redirects to its page', async () => {
    const error = await analyseRepositoryAction(visibleRepo).catch(e => e);

    const analysis = await prisma.analysis.findFirstOrThrow();
    expect(error).toMatchObject({
      message: 'NEXT_REDIRECT',
      url: `/dashboard/analysis/${analysis.id}`,
    });
    expect(analysis).toMatchObject({
      repositoryId: visibleRepo,
      status: 'pending',
      triggeredBy: 'manual',
    });
    expect(queueRepositoryAnalysis).toHaveBeenCalledTimes(1);
  });

  it("refuses to analyse a repository the viewer can't access", async () => {
    await expect(analyseRepositoryAction(hiddenRepo)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(await prisma.analysis.count()).toBe(0);
  });

  it('dismisses an alert and records who dismissed it', async () => {
    const alert = await prisma.alert.create({
      data: {
        repositoryId: visibleRepo,
        severity: 'high',
        title: 'Suspicious account',
        description: 'x',
        accountsInvolved: [],
      },
    });

    await dismissAlertAction(alert.id);

    const updated = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } });
    expect(updated.dismissed).toBe(true);
    expect(updated.dismissedBy).toBe('alice');
    expect(updated.dismissedAt).not.toBeNull();
  });

  it("refuses to dismiss alerts on repositories the viewer can't access", async () => {
    const alert = await prisma.alert.create({
      data: {
        repositoryId: hiddenRepo,
        severity: 'high',
        title: 'Suspicious account',
        description: 'x',
        accountsInvolved: [],
      },
    });

    await expect(dismissAlertAction(alert.id)).rejects.toThrow('NEXT_NOT_FOUND');
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })).dismissed).toBe(
      false
    );
  });
});
