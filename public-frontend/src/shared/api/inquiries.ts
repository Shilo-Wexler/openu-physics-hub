/**
 * Calls to the inquiries backend (the admin side, admin-backend). Kept apart from
 * shared/api/chat.ts because it is a different server with its own API.
 */

import { request } from "./client";

const BASE = "/api/inquiries";

// The inquiry types from the spec. Values are the keys the backend stores; labels live in the UI.
export const INQUIRY_TYPES = ["exams", "staff", "accessibility", "admin", "other"] as const;
export type InquiryType = (typeof INQUIRY_TYPES)[number];

// Same limit as the inquiries backend, which checks it again.
export const MAX_INQUIRY_LENGTH = 2000;

// The backend's "detail" for a Turnstile token it did not accept (rejected, expired, or missing).
export const TURNSTILE_ERRORS = ["invalid turnstile_token", "missing turnstile_token"];

export interface NewInquiry {
  course_id: number; // 0 for a general inquiry (the "כללי" row in shared/courses.csv)
  type: InquiryType;
  content: string;
  website: string; // the honeypot: always empty for a person, so the backend drops it otherwise
  turnstile_token: string; // from the Turnstile widget; single use, so a new one for every send
}

export function sendInquiry(inquiry: NewInquiry) {
  return request<{ id: number }>(BASE, { method: "POST", body: inquiry });
}
