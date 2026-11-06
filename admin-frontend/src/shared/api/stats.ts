/** The stats screen: GET /api/admin/stats, everything the screen shows for one period. Every level may read it. */

import { request } from "./client";
import type { InquiryType } from "./inquiries";

export type Period = "7" | "30" | "all";

export interface InquiryCourse {
  course_number: number;
  course_name: string;
  inquiry_count: number;
}

export interface ChatCourse {
  course_id: number;
  course_name: string;
  message_count: number;
}

export interface SiteVisits {
  /** Page loads on the public site in the period (calendar days in Israel, today included). */
  count: number;
  /** The same for the period just before it; null for "all", or when counting started inside it. */
  previous_count: number | null;
  /** The first day counted, "YYYY-MM-DD". */
  since: string;
  /** When the sync job last wrote the numbers. */
  updated_at: string;
}

export interface ChatSummary {
  /** Users who have an account now (not counting ones waiting to be deleted). */
  users_total: number;
  /** Accounts waiting to be deleted, now (not per period). */
  deletion_pending: number;
  /** Users who signed up in the period, and in the one before it; null for "all". */
  users_new: number | null;
  users_new_previous: number | null;
  /** Reviews and general chat posts still in the chat; previous is null for "all". */
  posts: number;
  posts_previous: number | null;
  /** Replies still in the chat; previous is null for "all". */
  replies: number;
  replies_previous: number | null;
}

export interface Stats {
  period: Period;
  inquiries: {
    /** Inquiries received in the period, in any status. */
    count: number;
    /** The same for the period just before it; null for "all". */
    previous_count: number | null;
    /** Every type, 0 included. */
    by_type: Record<InquiryType, number>;
    /** Most inquiries first. */
    top_courses: InquiryCourse[];
  };
  /** null until the sync job has run once. */
  visits: SiteVisits | null;
  /** null when the chat backend did not answer. */
  chat_summary: ChatSummary | null;
  /** Most messages first; null when the chat backend did not answer. */
  chat_courses: ChatCourse[] | null;
}

export function getStats(token: string, period: Period, signal?: AbortSignal) {
  return request<Stats>("/api/admin/stats", { token, params: { period }, signal });
}