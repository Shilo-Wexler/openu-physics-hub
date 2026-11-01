/** Inquiries from the public site's form: anonymous unless the sender left contact details.
    Every level may read and change them. */

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
  /** The sender left a way to reply (the list marks it; the details come only with one inquiry). */
  has_contact: boolean;
}

/** One inquiry on its own screen: the list leaves the contact details out, this has them.
    All null: anonymous. Otherwise a phone or an email (or both), and maybe a name. */
export interface InquiryWithContact extends Inquiry {
  contact_name: string | null;
  /** Digits only, maybe with a leading +. */
  contact_phone: string | null;
  contact_email: string | null;
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
  return request<InquiryWithContact>(`${BASE}/${id}`, { token, signal });
}

/** Changes the status and/or the note, and returns the inquiry as it is now. */
export function updateInquiry(token: string, id: number, change: InquiryChange) {
  return request<InquiryWithContact>(`${BASE}/${id}`, { token, method: "POST", body: change });
}