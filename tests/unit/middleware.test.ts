import { encode } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

const SECRET = 'middleware-test-secret';

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = SECRET;
  delete process.env.NEXTAUTH_URL;
});

async function request(path: string, token?: Record<string, unknown>) {
  const headers = new Headers();
  if (token) {
    headers.set('cookie', `next-auth.session-token=${await encode({ token, secret: SECRET })}`);
  }
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

const validToken = { sub: '1', login: 'alice', accessToken: 'ghu_token' };

describe('middleware', () => {
  it('lets GitHub webhooks, health checks and auth routes through without a session', async () => {
    for (const path of ['/api/webhooks/github', '/api/health', '/api/auth/session']) {
      const response = await middleware(await request(path));
      expect(response.headers.get('x-middleware-next')).toBe('1');
    }
  });

  it('rejects anonymous API requests with 401', async () => {
    const response = await middleware(await request('/api/repositories'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Authentication required' });
  });

  it('redirects anonymous dashboard visits to sign-in, preserving the destination', async () => {
    const response = await middleware(await request('/dashboard/alerts?repo=abc'));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/auth/signin');
    expect(location.searchParams.get('callbackUrl')).toBe('/dashboard/alerts?repo=abc');
  });

  it('allows signed-in users', async () => {
    const response = await middleware(await request('/dashboard', validToken));

    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('treats a session whose GitHub token could not be refreshed as signed out', async () => {
    const response = await middleware(
      await request('/api/repositories', { ...validToken, error: 'RefreshAccessTokenError' })
    );

    expect(response.status).toBe(401);
  });

  it('rejects tampered session cookies', async () => {
    const req = new NextRequest('http://localhost:3000/api/repositories', {
      headers: { cookie: 'next-auth.session-token=not-a-real-token' },
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await middleware(req);

    expect(response.status).toBe(401);
    errorSpy.mockRestore();
  });
});
