// Type definitions for NextAuth
export {};

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      login?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
    error?: 'RefreshAccessTokenError';
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    login?: string;
    githubId?: number;
    error?: 'RefreshAccessTokenError';
  }
}
