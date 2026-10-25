/** Typed calls to the committee's announcements (served by admin-backend, read without sign-in). */

import { request } from "./client";

const BASE = "/api/announcements";

export interface AnnouncementImage {
  url: string; // served by admin-backend, e.g. /api/announcements/12/image?v=1
  width: number; // in pixels: lets the page keep the image's space before it loads
  height: number;
  alt: string; // what the image shows, for screen readers
}

export interface Announcement {
  id: number;
  title: string;
  body: string; // plain text with line breaks, no HTML or markdown; may be empty when there is an image
  image: AnnouncementImage | null;
  pinned: boolean; // the one on the home page
  published_at: string; // ISO date-time; publishing again moves it to the top
  edited_at: string | null;
}

export interface AnnouncementPage {
  announcements: Announcement[]; // the pinned one first (first page only), then newest first; 20 per page
  next_before: string | null; // pass as `before` for the next page; null means no more
}

export function listAnnouncements(before?: string, signal?: AbortSignal) {
  // The cursor is a date with "+" and ":"; params encodes it so it reaches the server unchanged.
  return request<AnnouncementPage>(BASE, { params: { before }, signal });
}

/** The announcement on the home page, or null when none is pinned. */
export function getPinnedAnnouncement(signal?: AbortSignal) {
  return request<Announcement | null>(`${BASE}/pinned`, { signal });
}
