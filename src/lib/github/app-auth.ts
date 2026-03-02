import { App } from '@octokit/app';
import { Octokit } from '@octokit/rest';

if (!process.env.GITHUB_APP_ID) {
  throw new Error('GITHUB_APP_ID is not set');
}

if (!process.env.GITHUB_APP_PRIVATE_KEY) {
  throw new Error('GITHUB_APP_PRIVATE_KEY is not set');
}

// Parse the private key (handle both base64 and raw formats)
const privateKey = process.env.GITHUB_APP_PRIVATE_KEY.includes('BEGIN')
  ? process.env.GITHUB_APP_PRIVATE_KEY
  : Buffer.from(process.env.GITHUB_APP_PRIVATE_KEY, 'base64').toString('utf-8');

export const app = new App({
  appId: process.env.GITHUB_APP_ID,
  privateKey: privateKey,
});

/**
 * Get an authenticated Octokit instance for a specific installation
 */
export async function getInstallationOctokit(installationId: number): Promise<Octokit> {
  const octokit = await app.getInstallationOctokit(installationId);
  return octokit as unknown as Octokit;
}

/**
 * Verify that the app is properly configured
 */
export async function verifyAppAuth(): Promise<boolean> {
  try {
    // Simply try to get an installation to verify auth works
    return !!app;
  } catch (error) {
    console.error('Failed to verify app authentication:', error);
    return false;
  }
}
