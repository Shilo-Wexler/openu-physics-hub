import { GENERAL_COURSE_ID } from "../../shared/api/chat";
import { isAbort } from "../../shared/api/client";

/** The path of a course page; the general chat has its own (see the routes in App.tsx). */
export function coursePath(courseId: number): string {
  return courseId === GENERAL_COURSE_ID ? "/chat/general" : `/courses/${courseId}`;
}

/** The path that opens a message on its course page. */
export function messagePath(courseId: number, messageId: number): string {
  return `${coursePath(courseId)}/m/${messageId}`;
}

/** The full link to a course page, for sharing. */
export function courseUrl(courseId: number): string {
  return window.location.origin + coursePath(courseId);
}

/** The full link to a message, for sharing. */
export function messageUrl(courseId: number, messageId: number): string {
  return window.location.origin + messagePath(courseId, messageId);
}

/**
 * Shares a link: the phone's share sheet where there is one (mobile), otherwise copies it.
 * Returns "copied" when the link went to the clipboard, so the caller can say so.
 */
export async function shareLink(url: string): Promise<"shared" | "copied" | "cancelled"> {
  if (navigator.share) {
    try {
      await navigator.share({ url });
      return "shared";
    } catch (error) {
      // AbortError: the reader closed the share sheet. Anything else: fall back to copying.
      if (isAbort(error)) return "cancelled";
    }
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}