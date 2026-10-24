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
  /** Most messages first; null when the chat backend did not answer. */
  chat_courses: ChatCourse[] | null;
}

export function getStats(token: string, period: Period, signal?: AbortSignal) {
  return request<Stats>("/api/admin/stats", { token, params: { period }, signal });
}