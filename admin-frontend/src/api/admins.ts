/** Admin management. Every level can list; admins and super admins add, change and remove (see lib/levels). */

import type { Level } from "../lib/levels";
import { request } from "./client";

export interface AdminRow {
  email: string;
  role: Level;
  added_by: string | null; // null when added directly in the DB
  created_at: string;
}

const BASE = "/api/admin/admins";

export function listAdmins(token: string, signal?: AbortSignal) {
  return request<AdminRow[]>(BASE, { token, signal });
}

export function addAdmin(token: string, email: string, role: Level) {
  return request<AdminRow>(BASE, { token, method: "POST", body: { email, role } });
}

export function setAdminRole(token: string, email: string, role: Level) {
  return request<AdminRow>(`${BASE}/${encodeURIComponent(email)}/role`, { token, method: "PUT", body: { role } });
}

export function removeAdmin(token: string, email: string) {
  return request<void>(`${BASE}/${encodeURIComponent(email)}`, { token, method: "DELETE" });
}
