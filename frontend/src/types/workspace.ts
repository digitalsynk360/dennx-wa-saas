/** Mirrors backend/app/schemas/workspace.py response models. */

export interface RoleResponse {
  id: string;
  name: string;
  description: string | null;
}

export interface MemberUserResponse {
  id: string;
  full_name: string;
  email: string;
}

export interface WorkspaceMemberResponse {
  id: string;
  user: MemberUserResponse;
  role: RoleResponse;
  is_online: boolean;
  last_seen_at: string | null;
  created_at: string;
}

export interface WorkspaceResponse {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_at: string;
}
