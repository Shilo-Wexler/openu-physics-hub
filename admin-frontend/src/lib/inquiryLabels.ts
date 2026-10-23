/** How inquiry values are shown in the console. Shared by the list, the detail screen and the pickers. */

import type { InquiryStatus, InquiryType } from "../api/inquiries";

// The same wording as the site's form, so the committee sees what the student picked.
export const TYPE_LABEL: Record<InquiryType, string> = {
  exams: "בחינות ומטלות",
  staff: "סגל וחומרי הקורס",
  accessibility: "התאמות ונגישות",
  admin: "מנהלה ותוכנית לימודים",
  other: "אחר",
};

export const STATUS_LABEL: Record<InquiryStatus, string> = {
  new: "חדשה",
  in_progress: "בטיפול",
  closed: "סגורה",
};

/** "20201 · מכניקה"; the general row (number 0) shows its name only. */
export function courseLabel(courseNumber: number | null, name: string): string {
  return courseNumber === null || courseNumber === 0 ? name : `${courseNumber} · ${name}`;
}