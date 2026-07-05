/** Mirrors backend/app/schemas/auth.py response models. */

export interface UserResponse {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  is_superuser?: boolean;
  email_verified_at: string | null;
  last_login_at: string | null;
  created_at: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: string;
}

export interface TokenPairResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface SignupResponse {
  user: UserResponse;
  workspace: WorkspaceSummary;
  tokens: TokenPairResponse;
}

export interface MeResponse {
  user: UserResponse;
  workspaces: WorkspaceSummary[];
}

export interface ApiErrorResponse {
  detail: string;
}