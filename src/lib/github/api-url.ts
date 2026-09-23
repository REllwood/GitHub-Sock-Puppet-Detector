const DEFAULT_GITHUB_API_URL = 'https://api.github.com';

/**
 * GitHub REST API base URL. Override with GITHUB_API_URL for GitHub Enterprise Server
 * (e.g. https://github.example.com/api/v3).
 */
export function getGitHubApiUrl(): string {
  return (process.env.GITHUB_API_URL || DEFAULT_GITHUB_API_URL).replace(/\/+$/, '');
}
