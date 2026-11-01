/**
 * Calls to the inquiries backend (the admin side, admin-backend). Kept apart from
 * shared/api/chat.ts because it is a different server with its own API.
 */

import { request } from "./client";

const BASE = "/api/inquiries";

// The inquiry types from the spec. Values are the keys the backend stores; labels live in the UI.
export const INQUIRY_TYPES = ["exams", "staff", "accessibility", "admin", "other"] as const;
export type InquiryType = (typeof INQUIRY_TYPES)[number];

// Same limits as the inquiries backend, which checks them again.
export const MAX_INQUIRY_LENGTH = 2000;
export const MAX_CONTACT_NAME_LENGTH = 100;
// As typed, with spaces and dashes; the backend keeps only the digits (7 to 15) and a leading +.
export const MAX_CONTACT_PHONE_LENGTH = 30;
export const MAX_CONTACT_EMAIL_LENGTH = 254;

// The backend's "detail" for a Turnstile token it did not accept (rejected, expired, or missing).
export const TURNSTILE_ERRORS = ["invalid turnstile_token", "missing turnstile_token"];

// The backend's "detail" for a contact field it did not accept.
export const CONTACT_PHONE_ERROR = "invalid contact_phone";
export const CONTACT_EMAIL_ERROR = "invalid contact_email";

export interface NewInquiry {
  course_id: number; // 0 for a general inquiry (the "כללי" row in shared/courses.csv)
  type: InquiryType;
  content: string;
  // Not stored. true: no contact field may be sent. false: at least one of them is required.
  anonymous: boolean;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  website: string; // the honeypot: always empty for a person, so the backend drops it otherwise
  turnstile_token: string; // from the Turnstile widget; single use, so a new one for every send
}

export function sendInquiry(inquiry: NewInquiry) {
  return request<{ id: number }>(BASE, { method: "POST", body: inquiry });
}
