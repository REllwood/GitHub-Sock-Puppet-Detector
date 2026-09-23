import type { Prisma } from '@prisma/client';
import { getToken } from 'next-auth/jwt';
import type { NextRequest, NextResponse } from 'next/server';
import {
  GitHubAuthError,
  repositoryAccessFilter,
  viewerFromToken,
  type Viewer,
} from '@/lib/access';
import { jsonResponse } from '@/lib/http';
import { checkRateLimit } from '@/lib/rate-limit';

export interface AuthorisedRequest {
  viewer: Viewer;
  // Limits queries to repositories the viewer can access
  repositoryFilter: Prisma.RepositoryWhereInput;
}

/**
 * Authenticate, rate limit and scope an API request. Returns an error response to send
 * back if the request can't proceed.
 */
export async function authoriseApiRequest(
  req: NextRequest
): Promise<AuthorisedRequest | NextResponse> {
  const viewer = viewerFromToken(await getToken({ req }));

  if (!viewer) {
    return jsonResponse({ error: 'Authentication required' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(`user:${viewer.login.toLowerCase()}`);
  if (!rateLimit.allowed) {
    return jsonResponse(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.retryAfterSeconds),
          'X-RateLimit-Limit': String(rateLimit.limit),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  try {
    return { viewer, repositoryFilter: await repositoryAccessFilter(viewer) };
  } catch (error) {
    if (error instanceof GitHubAuthError) {
      return jsonResponse(
        { error: 'GitHub session expired, please sign in again' },
        { status: 401 }
      );
    }
    throw error;
  }
}

export function isErrorResponse(value: AuthorisedRequest | NextResponse): value is NextResponse {
  return !('viewer' in value);
}
