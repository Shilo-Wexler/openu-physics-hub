/** Meeting summaries, console only (never on the public site). Every level may read, create and edit;
 *  deleting needs an admin (the server answers 403 to a committee member). */

import { request } from "./client";

/** A row in the list: no text, so the list stays light. */
export interface MeetingListItem {
  id: number;
  /** "" when the summary has no title: the console then names it by its date. */
  title: string;
  /** "YYYY-MM-DD", the day of the meeting. */
  meeting_date: string;
}

export interface Meeting extends MeetingListItem {
  content: string;
  /** The admin's name, or the email when that admin has since been removed. */
  created_by_name: string;
  created_at: string;
  /** Same as created_by_name until someone changes the summary. */
  updated_by_name: string;
  updated_at: string;
}

/** What the console sends on create and on edit: always every field ("" title for none). */
export interface MeetingInput {
  title: string;
  meeting_date: string;
  content: string;
}

const BASE = "/api/admin/meetings";

/** Every summary, newest meeting first. No paging (see the server's list route). */
export function listMeetings(token: string, signal?: AbortSignal) {
  return request<{ items: MeetingListItem[] }>(BASE, { token, signal });
}

export function getMeeting(token: string, id: number, signal?: AbortSignal) {
  return request<Meeting>(`${BASE}/${id}`, { token, signal });
}

export function createMeeting(token: string, input: MeetingInput) {
  return request<Meeting>(BASE, { token, method: "POST", body: input });
}

/** Replaces every field (POST /{id}). Saving with no change does not count as an edit. */
export function updateMeeting(token: string, id: number, input: MeetingInput) {
  return request<Meeting>(`${BASE}/${id}`, { token, method: "POST", body: input });
}

export function deleteMeeting(token: string, id: number) {
  return request<void>(`${BASE}/${id}`, { token, method: "DELETE" });
}