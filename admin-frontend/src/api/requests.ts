/** Typed calls to the admin backend. Shapes mirror admin-backend/app/routes. */

import { request } from "./client";

// ---- Types -------------------------------------------------------------

export interface Course {
  name: string;
  course_number: number | null; // 0 for "כללי"
}

export type Status = "new" | "closed";

export interface RequestItem {
  id: number;
  full_name: string;
  email: string;
  course_name: string;
  status: Status;
  is_opened: boolean;
  created_at: string; // ISO date-time
  preview: string; // first 200 characters of the body
}

export interface RequestFull extends Omit<RequestItem, "preview"> {
  body: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface Summary {
  unread: number;
  in_progress: number;
  closed: number;
  total: number;
}

export interface StateChange {
  id: number;
  status: Status;
  is_opened: boolean;
}

export interface CourseStat {
  course_name: string;
  course_number: number | null;
  total: number;
  unread: number;
}

export interface WeekStat {
  week: string; // ISO date-time of the week's start
  total: number;
}

export interface TopSender {
  email: string;
  total: number;
  last_at: string;
  is_blocked: boolean;
}

export interface Blocked {
  email: string;
  reason: string | null;
  blocked_at: string;
}

export interface RequestFilters {
  course_name?: string;
  status?: Status;
  is_opened?: boolean;
  email?: string;
  sort?: "newest" | "oldest";
  page?: number;
  page_size?: number;
}

// ---- Admin -------------------------------------------------------------

const ADMIN = "/api/admin";

export function getMe(token: string, signal?: AbortSignal) {
  return request<{ email: string; name: string | null; roles: string[] }>(`${ADMIN}/me`, { token, signal });
}

export function getSummary(token: string, signal?: AbortSignal) {
  return request<Summary>(`${ADMIN}/summary`, { token, signal });
}

export function listRequests(token: string, filters: RequestFilters, signal?: AbortSignal) {
  return request<Page<RequestItem>>(`${ADMIN}/requests`, { token, signal, params: { ...filters } });
}

export function getRequest(token: string, id: number, signal?: AbortSignal) {
  return request<RequestFull>(`${ADMIN}/requests/${id}`, { token, signal });
}

export function markRead(token: string, id: number) {
  return request<StateChange>(`${ADMIN}/requests/${id}/read`, { token, method: "POST" });
}

export function markUnread(token: string, id: number) {
  return request<StateChange>(`${ADMIN}/requests/${id}/unread`, { token, method: "POST" });
}

export function closeRequest(token: string, id: number) {
  return request<StateChange>(`${ADMIN}/requests/${id}/close`, { token, method: "POST" });
}

/** Back to handling: a closed request becomes new again and stays read ("in progress"). */
export function reopenRequest(token: string, id: number) {
  return request<StateChange>(`${ADMIN}/requests/${id}/reopen`, { token, method: "POST" });
}

export function deleteRequest(token: string, id: number) {
  return request<void>(`${ADMIN}/requests/${id}`, { token, method: "DELETE" });
}

export function listAdminCourses(token: string, signal?: AbortSignal) {
  return request<Course[]>(`${ADMIN}/courses`, { token, signal });
}

export function statsByCourse(token: string, signal?: AbortSignal) {
  return request<CourseStat[]>(`${ADMIN}/stats/by-course`, { token, signal });
}

export function statsWeekly(token: string, weeks: number, signal?: AbortSignal) {
  return request<WeekStat[]>(`${ADMIN}/stats/weekly`, { token, signal, params: { weeks } });
}

export function topSenders(token: string, signal?: AbortSignal) {
  return request<TopSender[]>(`${ADMIN}/stats/top-senders`, { token, signal, params: { days: 30 } });
}

export function listBlocked(token: string, signal?: AbortSignal) {
  return request<Blocked[]>(`${ADMIN}/blocked`, { token, signal });
}

export function blockEmail(token: string, email: string, reason: string) {
  return request<Blocked>(`${ADMIN}/blocked`, {
    token,
    method: "POST",
    body: { email, reason: reason.trim() || null },
  });
}

export function unblockEmail(token: string, email: string) {
  return request<void>(`${ADMIN}/blocked/${encodeURIComponent(email)}`, { token, method: "DELETE" });
}
