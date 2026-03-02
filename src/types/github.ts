export interface GitHubUser {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  gravatar_id: string;
  url: string;
  html_url: string;
  type: string;
  site_admin: boolean;
  name?: string;
  company?: string;
  blog?: string;
  location?: string;
  email?: string;
  bio?: string;
  twitter_username?: string;
  public_repos: number;
  public_gists: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
}

export interface GitHubRepository {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  private: boolean;
  owner: GitHubUser;
  html_url: string;
  description?: string;
  fork: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  stargazers_count: number;
  watchers_count: number;
  language?: string;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
}

export interface GitHubComment {
  id: number;
  node_id: string;
  url: string;
  html_url: string;
  body: string;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
  issue_url?: string;
  pull_request_url?: string;
}

export interface WebhookIssueCommentEvent {
  action: 'created' | 'edited' | 'deleted';
  issue: {
    number: number;
    title: string;
    user: GitHubUser;
    state: string;
    created_at: string;
    updated_at: string;
  };
  comment: GitHubComment;
  repository: GitHubRepository;
  installation: {
    id: number;
    node_id: string;
  };
}

export interface WebhookPullRequestReviewCommentEvent {
  action: 'created' | 'edited' | 'deleted';
  pull_request: {
    number: number;
    title: string;
    user: GitHubUser;
    state: string;
    created_at: string;
    updated_at: string;
  };
  comment: GitHubComment;
  repository: GitHubRepository;
  installation: {
    id: number;
    node_id: string;
  };
}

export interface WebhookInstallationEvent {
  action: 'created' | 'deleted' | 'suspend' | 'unsuspend';
  installation: {
    id: number;
    account: GitHubUser;
    repository_selection: string;
    access_tokens_url: string;
    repositories_url: string;
    html_url: string;
    app_id: number;
    target_id: number;
    target_type: string;
    permissions: Record<string, string>;
    events: string[];
    created_at: string;
    updated_at: string;
  };
  repositories?: GitHubRepository[];
}

export type WebhookEvent =
  | WebhookIssueCommentEvent
  | WebhookPullRequestReviewCommentEvent
  | WebhookInstallationEvent;
