/** Who the signed-in admin is: GET /api/admin/me. The console also uses it as the admin check (401/403 otherwise). */

import { request } from "./client";

export interface Me {
  email: string;
  name: string | null;
  roles: string[];
}

export function getMe(token: string, signal?: AbortSignal) {
  return request<Me>("/api/admin/me", { token, signal });
}