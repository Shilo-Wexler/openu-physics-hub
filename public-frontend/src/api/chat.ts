/** Typed calls to the chat backend. Shapes mirror the JSON that chat-backend/app/routes returns. */

import { request } from "./client";

const BASE = "/api/chat";

// ---- Types -------------------------------------------------------------

export interface Course {
  id: number;
  name: string;
  avg_difficulty: number | null; // null until someone rates the course
  avg_recommendation: number | null;
  ratings_count: number;
}

export interface Rating {
  difficulty: number; // 1-5
  recommendation: number; // 1-5
}

export interface CourseDetails extends Course {
  my_rating: Rating | null; // null for guests and for users who have not rated
}

export interface Me {
  user_id: string;
  nickname: string;
}

export interface Message {
  id: number;
  nickname: string;
  content: string;
  created_at: string; // ISO date-time
  edited_at: string | null;
  reply_to_id: number | null;
  reply_to_deleted: boolean;
  reply_to_nickname: string | null; // null when there is no reply or the quoted message was deleted
  reply_to_content: string | null;
  like_count: number;
  liked_by_me: boolean;
  is_mine: boolean;
}

export interface MessagePage {
  messages: Message[]; // newest first
  next_before: number | null; // pass as `before` for older messages; null means no more
}

// ---- Auth and profile --------------------------------------------------

export function signInWithGoogle(idToken: string) {
  return request<{ user_id: string }>(`${BASE}/auth/google`, {
    method: "POST",
    body: { id_token: idToken },
  });
}

export function logout() {
  return request<{ status: string }>(`${BASE}/auth/logout`, { method: "POST" });
}

export function logoutAll() {
  return request<{ status: string }>(`${BASE}/auth/logout-all`, { method: "POST" });
}

export function getMe(signal?: AbortSignal) {
  return request<Me>(`${BASE}/me`, { signal });
}

export function changeNickname(nickname: string) {
  return request<{ nickname: string }>(`${BASE}/me/nickname`, {
    method: "PUT",
    body: { nickname },
  });
}

// ---- Courses and ratings -----------------------------------------------

export function listCourses(signal?: AbortSignal) {
  return request<Course[]>(`${BASE}/courses`, { signal });
}

export function getCourse(courseId: number, signal?: AbortSignal) {
  return request<CourseDetails>(`${BASE}/courses/${courseId}`, { signal });
}

export function rateCourse(courseId: number, rating: Rating) {
  return request<Rating>(`${BASE}/courses/${courseId}/rating`, {
    method: "PUT",
    body: rating,
  });
}

// ---- Messages ----------------------------------------------------------

export function listMessages(courseId: number, before?: number, signal?: AbortSignal) {
  const query = before === undefined ? "" : `?before=${before}`;
  return request<MessagePage>(`${BASE}/courses/${courseId}/messages${query}`, { signal });
}

export function postMessage(courseId: number, content: string, replyToId?: number) {
  return request<{ id: number; created_at: string }>(`${BASE}/courses/${courseId}/messages`, {
    method: "POST",
    body: { content, reply_to_id: replyToId ?? null },
  });
}

export function editMessage(messageId: number, content: string) {
  return request<{ id: number; edited_at: string }>(`${BASE}/messages/${messageId}`, {
    method: "PUT",
    body: { content },
  });
}

export function deleteMessage(messageId: number) {
  return request<{ status: string }>(`${BASE}/messages/${messageId}`, { method: "DELETE" });
}

export function likeMessage(messageId: number) {
  return request<{ liked: boolean }>(`${BASE}/messages/${messageId}/like`, { method: "PUT" });
}

export function unlikeMessage(messageId: number) {
  return request<{ liked: boolean }>(`${BASE}/messages/${messageId}/like`, { method: "DELETE" });
}

export function reportMessage(messageId: number) {
  return request<{ status: string }>(`${BASE}/messages/${messageId}/report`, { method: "POST" });
}