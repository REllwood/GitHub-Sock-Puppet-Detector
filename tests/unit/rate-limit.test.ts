import { checkRateLimit, closeRateLimiter } from '@/lib/rate-limit';

describe('rate limiting', () => {
  afterAll(async () => {
    await closeRateLimiter();
  });

  it('fails open quickly when Redis is unreachable', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:1';
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const started = Date.now();

    const result = await checkRateLimit('user:someone');

    expect(result.allowed).toBe(true);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(errorSpy).toHaveBeenCalledWith(
      'Rate limiting unavailable (allowing request):',
      expect.anything()
    );
    errorSpy.mockRestore();
  });
});
