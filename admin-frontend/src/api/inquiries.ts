/** Anonymous inquiries from the public site's form. Every call needs the "inquiries" role (or "admin"). */

import { request } from "./client";

export const INQUIRY_STATUSES = ["new", "in_progress", "closed"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const INQUIRY_TYPES = ["exams", "staff", "accessibility", "admin", "other"] as const;
export type InquiryType = (typeof INQUIRY_TYPES)[number];

export interface Inquiry {
  id: number;
  /** 0 is the general row (כללי). */
  course_number: number;
  course_name: string;
  type: InquiryType;
  content: string;
  status: InquiryStatus;
  /** The admin who last changed the status; null while nobody has. */
  handled_by: string | null;
  internal_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface InquiryPage {
  items: Inquiry[];
  /** Pass as `before` for the next page; null on the last page. */
  next_before: number | null;
}

export type InquiryCounts = Record<InquiryStatus, number>;

export interface InquiryFilters {
  status?: InquiryStatus;
  type?: InquiryType;
  course?: number;
  before?: number;
}

/** What a change sends: only the fields that change. internal_note "" clears the note. */
export interface InquiryChange {
  status?: InquiryStatus;
  internal_note?: string;
}

const BASE = "/api/admin/inquiries";

/** Newest first, one page (the server's page size). */
export function listInquiries(token: string, filters: InquiryFilters, signal?: AbortSignal) {
  return request<InquiryPage>(BASE, { token, params: { ...filters }, signal });
}

export function getInquiryCounts(token: string, signal?: AbortSignal) {
  return request<InquiryCounts>(`${BASE}/counts`, { token, signal });
}

export function getInquiry(token: string, id: number, signal?: AbortSignal) {
  return request<Inquiry>(`${BASE}/${id}`, { token, signal });
}

/** Changes the status and/or the note, and returns the inquiry as it is now. */
export function updateInquiry(token: string, id: number, change: InquiryChange) {
  return request<Inquiry>(`${BASE}/${id}`, { token, method: "POST", body: change });
}