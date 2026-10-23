/**
 * Chat moderation, through the admin backend (/api/admin/chat/*), which calls the chat backend's
 * /internal API server to server. Shapes mirror chat-backend/docs/internal-api.md.
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

/** reopen and restore are only ever undos (of dismiss and remove). */
export type ModerationActionType = "dismiss" | "remove" | "block" | "unblock" | "reopen" | "restore";

/** What became of a message: still in the chat, removed by a moderator, or deleted by its author. */
export type MessageState = "active" | "removed" | "deleted";

/** The chat backend's details of a message an action was about, as it is now. */
export interface ActionMessage {
  message_id: number;
  course_id: number;
  course_name: string;
  content: string;
  created_at: string;
  author_id: string;
  author_nickname: string;
  state: MessageState;
  open_reports: number;
  all_reports: number;
}

/** The chat backend's details of a user an action was about, as they are now. */
export interface ActionUser {
  user_id: string;
  nickname: string;
  blocked_at: string | null;
}

export interface ModerationAction {
  id: number;
  admin_email: string;
  action: ModerationActionType;
  message_id: number | null;
  user_id: string | null;
  created_at: string;
  /** Set on an undo: the action it undid. */
  undoes: number | null;
  /** Set when this action was undone: the undo's id. */
  undone_by: number | null;
  /** Only the latest action on its message or user, not undone yet. */
  can_undo: boolean;
  /** null for a user action, or when the chat backend could not be reached. */
  message: ActionMessage | null;
  /** null for a message action, or when the chat backend could not be reached. */
  user: ActionUser | null;
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

export function moderationAction(token: string, actionId: number, signal?: AbortSignal) {
  return request<ModerationAction>(`${BASE}/actions/${actionId}`, { token, signal });
}

/** Sends the opposite action to the chat and logs it. 409 when it can't be undone. */
export function undoModerationAction(token: string, actionId: number) {
  return request<{ undone: number; action: ModerationActionType }>(`${BASE}/actions/${actionId}/undo`, {
    token,
    method: "POST",
  });
}