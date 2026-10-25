/** The course list (shared/courses.csv as loaded into the admin DB), for the console's filters. */

import { request } from "./client";

export interface Course {
  name: string;
  /** 0 is the general row (כללי). */
  course_number: number | null;
}

/** Active courses, ordered by number (so כללי, number 0, comes first). */
export function listCourses(token: string, signal?: AbortSignal) {
  return request<Course[]>("/api/admin/courses", { token, signal });
}
