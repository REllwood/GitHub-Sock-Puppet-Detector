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

  it('closes promptly while the client is between reconnect attempts', async () => {
    // The client from the previous test is still retrying the unreachable Redis;
    // let it settle into its reconnect back-off
    await new Promise(resolve => setTimeout(resolve, 300));

    const started = Date.now();
    await closeRateLimiter();

    expect(Date.now() - started).toBeLessThan(1000);
  });
});
