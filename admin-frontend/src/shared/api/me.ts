/** Who the signed-in admin is: GET /api/admin/me. The console also uses it as the admin check (401/403 otherwise). */

import type { Level } from "../lib/levels";
import { request } from "./client";

export interface Me {
  email: string;
  name: string | null;
  role: Level;
}

export function getMe(token: string, signal?: AbortSignal) {
  return request<Me>("/api/admin/me", { token, signal });
}