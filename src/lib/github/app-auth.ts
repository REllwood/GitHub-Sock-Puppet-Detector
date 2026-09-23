import { App } from '@octokit/app';
import { Octokit } from '@octokit/rest';
import { getGitHubApiUrl } from './api-url';

/**
 * Parse the private key (handles both raw PEM, with literal "\n" escapes, and base64 formats)
 */
export function parsePrivateKey(value: string): string {
  if (value.includes('BEGIN')) {
    return value.replace(/\\n/g, '\n');
  }
  return Buffer.from(value, 'base64').toString('utf-8');
}

let app: App | undefined;

/**
 * Get the GitHub App instance, created on first use so that importing this module
 * never fails when credentials are missing (e.g. during `next build`).
 */
export function getApp(): App {
  if (app) return app;

  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId) {
    throw new Error('GITHUB_APP_ID is not set');
  }

  if (!privateKey) {
    throw new Error('GITHUB_APP_PRIVATE_KEY is not set');
  }

  app = new App({
    appId,
    privateKey: parsePrivateKey(privateKey),
    // Use the full REST client (the default is a bare core client without endpoint methods)
    Octokit: Octokit.defaults({ baseUrl: getGitHubApiUrl() }),
  });

  return app;
}

/**
 * Get an authenticated Octokit instance for a specific installation
 */
export async function getInstallationOctokit(installationId: number): Promise<Octokit> {
  return (await getApp().getInstallationOctokit(installationId)) as unknown as Octokit;
}
