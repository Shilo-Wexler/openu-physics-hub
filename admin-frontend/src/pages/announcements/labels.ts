/** Words shared by the announcement screens. */

import type { AdminAnnouncement } from "../../api/announcements";

/** What names an announcement in a list or a note. Every field is optional, so without a title it is the
    start of the text, and an image-only one is named by its description. */
export function announcementName(announcement: AdminAnnouncement): string {
  return announcement.title || announcement.body || announcement.image?.alt || "הכרזה ריקה";
}