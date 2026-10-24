/** Admin management. Every level can list; admins and super admins add, change and remove (see lib/levels).
    Everyone renames themselves; renaming someone else follows the same rules as changing their level. */

import type { Level } from "../lib/levels";
import { request } from "./client";

export interface AdminRow {
  email: string;
  /** Shown in the console instead of the email. */
  name: string;
  role: Level;
  added_by: string | null; // null when added directly in the DB
  created_at: string;
}

const BASE = "/api/admin/admins";

function adminPath(email: string, action = "") {
  return `${BASE}/${encodeURIComponent(email)}${action}`;
}

export function listAdmins(token: string, signal?: AbortSignal) {
  return request<AdminRow[]>(BASE, { token, signal });
}

export function addAdmin(token: string, email: string, name: string, role: Level) {
  return request<AdminRow>(BASE, { token, method: "POST", body: { email, name, role } });
}

export function setAdminName(token: string, email: string, name: string) {
  return request<AdminRow>(adminPath(email, "/name"), { token, method: "PUT", body: { name } });
}

export function setAdminRole(token: string, email: string, role: Level) {
  return request<AdminRow>(adminPath(email, "/role"), { token, method: "PUT", body: { role } });
}

export function removeAdmin(token: string, email: string) {
  return request<void>(adminPath(email), { token, method: "DELETE" });
}
