import { getRedisConnectionOptions } from '@/lib/queue/connection';

describe('Redis connection options', () => {
  it('parses a plain redis URL', () => {
    const options = getRedisConnectionOptions('redis://redis:6380');

    expect(options.host).toBe('redis');
    expect(options.port).toBe(6380);
    expect(options.tls).toBeUndefined();
    expect(options.maxRetriesPerRequest).toBeNull();
  });

  it('defaults the port to 6379', () => {
    expect(getRedisConnectionOptions('redis://localhost').port).toBe(6379);
  });

  it('parses credentials, database index and TLS', () => {
    const options = getRedisConnectionOptions('rediss://user:p%40ss@cache.example.com:6390/2');

    expect(options.username).toBe('user');
    expect(options.password).toBe('p@ss');
    expect(options.db).toBe(2);
    expect(options.tls).toEqual({});
  });

  it('rejects unsupported protocols', () => {
    expect(() => getRedisConnectionOptions('http://localhost:6379')).toThrow(/Unsupported/);
  });

  it('rejects an invalid database index', () => {
    expect(() => getRedisConnectionOptions('redis://localhost:6379/abc')).toThrow(/database index/);
  });
});
