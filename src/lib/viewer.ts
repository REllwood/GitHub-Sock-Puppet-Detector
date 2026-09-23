import type { Prisma } from '@prisma/client';
import { getToken } from 'next-auth/jwt';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  GitHubAuthError,
  repositoryAccessFilter,
  viewerFromToken,
  type Viewer,
} from '@/lib/access';

type GetTokenRequest = Parameters<typeof getToken>[0]['req'];

/**
 * The signed-in viewer for server components and server actions, or null
 */
export async function getViewer(): Promise<Viewer | null> {
  const token = await getToken({
    req: { cookies: cookies(), headers: headers() } as unknown as GetTokenRequest,
  });
  return viewerFromToken(token);
}

/**
 * The signed-in viewer and their repository access filter. Redirects to sign-in if there
 * is no valid session or GitHub has rejected the viewer's token.
 */
export async function requireViewer(
  callbackUrl = '/dashboard'
): Promise<{ viewer: Viewer; repositoryFilter: Prisma.RepositoryWhereInput }> {
  const signIn = `/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  const viewer = await getViewer();

  if (!viewer) {
    redirect(signIn);
  }

  try {
    return { viewer, repositoryFilter: await repositoryAccessFilter(viewer) };
  } catch (error) {
    if (error instanceof GitHubAuthError) {
      redirect(`${signIn}&error=SessionExpired`);
    }
    throw error;
  }
}
