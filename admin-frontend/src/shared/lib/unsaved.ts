/** Unsaved changes in a form screen: the question the back link asks before leaving, and the browser's own
    question when the tab is closed or reloaded. */

import { useEffect } from "react";

export const LEAVE_QUESTION = "יש שינויים שלא נשמרו. לצאת בלי לשמור?";

/** While `dirty`, closing or reloading the tab asks first. Browsers show their own text, not ours. */
export function useWarnOnLeave(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}