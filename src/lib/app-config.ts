/**
 * Link for installing the GitHub App, from GITHUB_APP_SLUG (the app's URL name on GitHub),
 * or null if it isn't configured
 */
export function getAppInstallUrl(): string | null {
  const slug = process.env.GITHUB_APP_SLUG?.trim();
  return slug ? `https://github.com/apps/${encodeURIComponent(slug)}/installations/new` : null;
}
