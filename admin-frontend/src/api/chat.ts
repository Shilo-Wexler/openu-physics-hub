/**
 * Chat moderation, through the admin backend (/api/admin/chat/*), which calls the chat backend's
 * /internal API server to server. Shapes mirror chat-backend/docs/moderation-api.md.
 */

import { request } from "./client";

const BASE = "/api/admin/chat";

export interface ReportedMessage {
  message_id: number;
  course_id: number;
  course_name: string;
  content: string;
  created_at: string;
  author_id: string; // uuid
  author_nickname: string;
  author_blocked: boolean;
  report_count: number; // open reports on this message
  last_reported_at: string;
  author_removed_count: number; // this author's messages removed by moderators so far
  author_reported_count: number; // this author's messages ever reported
}

export interface BlockedUser {
  user_id: string;
  nickname: string;
  blocked_at: string;
  removed_count: number;
}

export interface RemovedMessage {
  message_id: number;
  course_id: number;
  course_name: string;
  content: string;
  created_at: string;
  removed_at: string;
}

export type ModerationActionType = "dismiss" | "remove" | "block" | "unblock";

export interface ModerationAction {
  id: number;
  admin_email: string;
  action: ModerationActionType;
  message_id: number | null;
  user_id: string | null;
  created_at: string;
}

export function reportedMessages(token: string, signal?: AbortSignal) {
  return request<ReportedMessage[]>(`${BASE}/reported-messages`, { token, signal });
}

export function dismissReports(token: string, messageId: number) {
  return request<{ dismissed_reports: number }>(`${BASE}/messages/${messageId}/dismiss`, { token, method: "POST" });
}

export function removeMessage(token: string, messageId: number) {
  return request<{ status: string }>(`${BASE}/messages/${messageId}/remove`, { token, method: "POST" });
}

export function blockUser(token: string, userId: string) {
  return request<{ status: string }>(`${BASE}/users/${userId}/block`, { token, method: "POST" });
}

export function unblockUser(token: string, userId: string) {
  return request<{ status: string }>(`${BASE}/users/${userId}/unblock`, { token, method: "POST" });
}

export function blockedUsers(token: string, signal?: AbortSignal) {
  return request<BlockedUser[]>(`${BASE}/blocked-users`, { token, signal });
}

export function removedMessages(token: string, userId: string, signal?: AbortSignal) {
  return request<RemovedMessage[]>(`${BASE}/users/${userId}/removed-messages`, { token, signal });
}

export function moderationActions(token: string, signal?: AbortSignal) {
  return request<ModerationAction[]>(`${BASE}/actions`, { token, signal, params: { limit: 100 } });
}
