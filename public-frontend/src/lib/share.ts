/** The link that opens a message on its course page (see the route in App.tsx). */
export function messageUrl(courseId: number, messageId: number): string {
  return `${window.location.origin}/courses/${courseId}/m/${messageId}`;
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
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}