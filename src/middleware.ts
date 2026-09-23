import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// API routes that don't use a user session (GitHub signs webhooks; health checks are public)
const PUBLIC_API_PREFIXES = ['/api/auth', '/api/webhooks', '/api/health'];

/**
 * Require a signed-in user for the dashboard and API. Enforced on the server so no
 * dashboard data is rendered for anonymous visitors.
 */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (
    PUBLIC_API_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
  ) {
    return NextResponse.next();
  }

  const token = await getToken({ req });
  if (token?.accessToken && !token.error) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const signIn = new URL('/auth/signin', req.url);
  signIn.searchParams.set('callbackUrl', `${pathname}${search}`);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
};
