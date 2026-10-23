/** The inquiry list's filters live in the URL (?status=&course=&type=), so a refresh, the back button
    and the picker screens all keep them without passing state around. */

import { INQUIRY_STATUSES, INQUIRY_TYPES, type InquiryStatus, type InquiryType } from "../../api/inquiries";

export type View = InquiryStatus | "all";

export interface Filters {
  view: View;
  /** A course number (0 is the general row); null = every course. */
  course: number | null;
  /** null = every type. */
  type: InquiryType | null;
}

// The list opens on new inquiries: those are the ones waiting for someone.
const DEFAULT_VIEW: View = "new";

function isStatus(value: string | null): value is InquiryStatus {
  return value !== null && (INQUIRY_STATUSES as readonly string[]).includes(value);
}

function isType(value: string | null): value is InquiryType {
  return value !== null && (INQUIRY_TYPES as readonly string[]).includes(value);
}

/** Reads the filters from the URL. A missing or broken value falls back to its default. */
export function readFilters(params: URLSearchParams): Filters {
  const status = params.get("status");
  const view: View = status === "all" ? "all" : isStatus(status) ? status : DEFAULT_VIEW;

  const courseText = params.get("course");
  const course = courseText !== null && /^\d+$/.test(courseText) ? Number(courseText) : null;

  const typeText = params.get("type");
  const type = isType(typeText) ? typeText : null;

  return { view, course, type };
}

/** The query string for these filters, with its "?", or "" when all are defaults. */
export function filtersSearch(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.view !== DEFAULT_VIEW) params.set("status", filters.view);
  if (filters.course !== null) params.set("course", String(filters.course));
  if (filters.type !== null) params.set("type", filters.type);
  const text = params.toString();
  return text ? `?${text}` : "";
}