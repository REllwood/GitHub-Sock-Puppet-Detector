import { analyzeRepository } from '@/lib/detection/analyzer';
import { LLMAnalyzer } from '@/lib/detection/llm-analysis';

const mockFindUnique = jest.fn();
const mockFindMany = jest.fn();
jest.mock('@/lib/db', () => ({
  prisma: {
    repository: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
    comment: { findMany: (...args: unknown[]) => mockFindMany(...args) },
  },
}));

const T0 = new Date('2026-01-01T00:00:00Z').getTime();

function storedComment(username: string, content: string, minutesAfter: number) {
  return {
    id: `c-${username}`,
    accountId: `id-${username}`,
    account: {
      id: `id-${username}`,
      username,
      email: null,
      createdAt: new Date(T0 - 2000 * 86400000),
      profileData: { public_repos: 10, followers: 10 },
      activitySummary: null,
    },
    repositoryId: 'repo-1',
    content,
    createdAt: new Date(T0 + minutesAfter * 60000),
    issueNumber: 1,
    prNumber: null,
  };
}

function analyzerReturning(response: unknown, status = 200) {
  const fetchImpl = jest.fn(
    async () => new Response(JSON.stringify(response), { status })
  ) as unknown as typeof fetch;
  return new LLMAnalyzer(
    {
      provider: 'ollama',
      model: 'test',
      ollamaUrl: 'http://ollama:11434',
      timeoutMs: 1000,
    },
    fetchImpl
  );
}

beforeEach(() => {
  mockFindUnique.mockResolvedValue({ fullName: 'octo-org/widgets' });
  mockFindMany.mockResolvedValue([
    storedComment(
      'subtle-a',
      'Honestly the project would be better off with fresh leadership soon',
      0
    ),
    storedComment(
      'subtle-b',
      'Current stewardship is holding everything back, time for someone new',
      600
    ),
    storedComment('regular', 'The CSV exporter drops rows after a null timestamp', 1200),
  ]);
});

describe('analyser with LLM analysis', () => {
  it('adds the LLM result to the risk score and flag reasons', async () => {
    const llm = analyzerReturning({
      message: {
        content: JSON.stringify({
          writingStyleScore: 80,
          coordinationScore: 90,
          socialEngineeringScore: 85,
          summary: 'Two accounts push for a maintainer change in different words',
          suspiciousAccounts: [
            { username: 'subtle-a', score: 90, reason: 'Pushes for new leadership' },
            { username: 'subtle-b', score: 88, reason: 'Echoes subtle-a in different words' },
          ],
        }),
      },
    });

    const withLLM = await analyzeRepository('repo-1', { llm });
    const withoutLLM = await analyzeRepository('repo-1', { llm: null });

    const scoreOf = (result: typeof withLLM, name: string) =>
      result.accountAnalyses.find(a => a.username === name)!;

    expect(scoreOf(withLLM, 'subtle-a').riskScore).toBeGreaterThan(
      scoreOf(withoutLLM, 'subtle-a').riskScore
    );
    expect(scoreOf(withLLM, 'subtle-a').flagReasons).toContain('LLM: Pushes for new leadership');
    expect(scoreOf(withLLM, 'regular').detections.llmAnalysis).toEqual({
      detected: false,
      score: 0,
    });
    expect(withLLM.clusters).toContainEqual(
      expect.objectContaining({ type: 'llm', accounts: ['subtle-a', 'subtle-b'] })
    );
  });

  it('carries on without the LLM if the provider fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const llm = analyzerReturning({ error: 'model not found' }, 404);

    const result = await analyzeRepository('repo-1', { llm });

    expect(result.accountAnalyses).toHaveLength(3);
    expect(result.accountAnalyses.every(a => a.detections.llmAnalysis === undefined)).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('LLM analysis (ollama) failed'),
      expect.any(Error)
    );
    warn.mockRestore();
  });
});
