import type { NextAuthOptions } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import GithubProvider from 'next-auth/providers/github';

// Sessions last at most a day; access to repositories is re-checked against GitHub regularly
const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

// Refresh the GitHub user token a little before it expires
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Exchange a refresh token for a new GitHub user access token. GitHub App user tokens
 * expire after 8 hours when token expiration is enabled (the default for new apps).
 */
async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
      }),
    });

    const data = await response.json();
    if (!response.ok || data.error || !data.access_token) {
      throw new Error(data.error_description || data.error || `HTTP ${response.status}`);
    }

    return {
      ...token,
      accessToken: data.access_token,
      accessTokenExpires: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
      refreshToken: data.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch (error) {
    console.error('Failed to refresh GitHub access token:', error);
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}

if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
  console.warn('GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are not set - GitHub sign-in will fail');
}

export const authOptions: NextAuthOptions = {
  providers: [
    // Use the GitHub App's own client ID and secret: the app's user tokens are what allow
    // looking up which installations (and repositories) a user can access
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID ?? '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
      authorization: {
        params: {
          scope: 'read:user user:email',
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      // Initial sign-in
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: account.expires_at ? account.expires_at * 1000 : undefined,
          login: profile && 'login' in profile ? (profile.login as string) : token.login,
          githubId: account.providerAccountId ? Number(account.providerAccountId) : undefined,
        };
      }

      // Token still valid (or non-expiring)
      if (!token.accessTokenExpires || Date.now() < token.accessTokenExpires - REFRESH_MARGIN_MS) {
        return token;
      }

      if (!token.refreshToken) {
        return { ...token, error: 'RefreshAccessTokenError' };
      }

      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      // The access token stays in the encrypted session cookie; it is never sent to the browser
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.login = token.login;
      }
      session.error = token.error;
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
