/** The course list, loaded from the server once per page load and shared by every page that needs it. */

import { listCourses, type Course } from "../../shared/api/chat";

let pending: Promise<Course[]> | null = null;

/**
 * Returns the course list. The first call starts the request; later calls get the same
 * promise, so /courses and the inquiry form never load the list twice.
 */
export function loadCourses(): Promise<Course[]> {
  if (pending === null) {
    pending = listCourses().catch((error: unknown) => {
      // Forget the failed request, so the next call tries again.
      pending = null;
      throw error;
    });
  }
  return pending;
}