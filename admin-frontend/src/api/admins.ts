/** Admin management. Everyone can list; only a full admin (role "admin") can add, change or remove. */

import { request } from "./client";

export interface AdminRow {
  email: string;
  roles: string[];
  added_by: string | null; // null when added directly in the DB
  created_at: string;
}

const BASE = "/api/admin/admins";

export function listAdmins(token: string, signal?: AbortSignal) {
  return request<AdminRow[]>(BASE, { token, signal });
}

export function addAdmin(token: string, email: string, roles: string[]) {
  return request<AdminRow>(BASE, { token, method: "POST", body: { email, roles } });
}

export function setAdminRoles(token: string, email: string, roles: string[]) {
  return request<AdminRow>(`${BASE}/${encodeURIComponent(email)}/roles`, { token, method: "PUT", body: { roles } });
}

export function removeAdmin(token: string, email: string) {
  return request<void>(`${BASE}/${encodeURIComponent(email)}`, { token, method: "DELETE" });
}
