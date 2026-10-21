/** Committee announcements, shown on the public site. Every call needs the "announcements" role (or "admin"). */

import { request, requestBlob } from "./client";

export interface AnnouncementImage {
  /** The console's own URL (works for drafts too, needs the token: load it with loadAnnouncementImage). */
  url: string;
  width: number;
  height: number;
  alt: string;
}

export interface AdminAnnouncement {
  id: number;
  title: string;
  body: string;
  /** null: a draft, not on the site. */
  published_at: string | null;
  /** On the site's home page. At most one, and only a published one. */
  pinned: boolean;
  created_at: string;
  /** Set when the text or the image changed while published. */
  edited_at: string | null;
  image: AnnouncementImage | null;
  author_email: string;
}

export interface AnnouncementPage {
  items: AdminAnnouncement[];
  total: number;
  page: number;
  page_size: number;
}

/** What the console sends on create and on edit: always the whole text. */
export interface AnnouncementInput {
  title: string;
  body: string;
}

const BASE = "/api/admin/announcements";
export const PAGE_SIZE = 25;

export function listAnnouncements(token: string, page: number, signal?: AbortSignal) {
  return request<AnnouncementPage>(BASE, { token, params: { page, page_size: PAGE_SIZE }, signal });
}

/** Saved as a draft; publishAnnouncement puts it on the site. */
export function createAnnouncement(token: string, input: AnnouncementInput) {
  return request<AdminAnnouncement>(BASE, { token, method: "POST", body: input });
}

/** POST, not PUT: the backend's CORS setup allows only GET, POST and DELETE. */
export function updateAnnouncement(token: string, id: number, input: AnnouncementInput) {
  return request<AdminAnnouncement>(`${BASE}/${id}`, { token, method: "POST", body: input });
}

export function deleteAnnouncement(token: string, id: number) {
  return request<void>(`${BASE}/${id}`, { token, method: "DELETE" });
}

/** Puts it on the site, at the top. pin: also on the home page, in place of the one pinned before. */
export function publishAnnouncement(token: string, id: number, pin: boolean) {
  return request<AdminAnnouncement>(`${BASE}/${id}/publish`, { token, method: "POST", params: { pin } });
}

/** Back to a draft: off the site and off the home page. */
export function unpublishAnnouncement(token: string, id: number) {
  return request<AdminAnnouncement>(`${BASE}/${id}/unpublish`, { token, method: "POST" });
}

/** On the home page, in place of the one pinned before. Only a published announcement. */
export function pinAnnouncement(token: string, id: number) {
  return request<AdminAnnouncement>(`${BASE}/${id}/pin`, { token, method: "POST" });
}

export function unpinAnnouncement(token: string, id: number) {
  return request<AdminAnnouncement>(`${BASE}/${id}/unpin`, { token, method: "POST" });
}

/** Adds or replaces the image. The file itself is the body; its description goes in ?alt=. */
export function uploadAnnouncementImage(token: string, id: number, file: File, alt: string) {
  return request<AdminAnnouncement>(`${BASE}/${id}/image`, { token, method: "POST", file, params: { alt } });
}

export function removeAnnouncementImage(token: string, id: number) {
  return request<AdminAnnouncement>(`${BASE}/${id}/image`, { token, method: "DELETE" });
}

/** The image bytes for a preview. An img tag cannot send the token, so the page fetches them itself. */
export function loadAnnouncementImage(token: string, image: AnnouncementImage, signal?: AbortSignal) {
  return requestBlob(image.url, { token, signal });
}
