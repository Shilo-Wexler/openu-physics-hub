/** Tells components whether the screen is computer-sized, for content that differs on a computer. */

import { useSyncExternalStore } from "react";

/** The one computer breakpoint. CSS modules repeat it as `@media (min-width: 1024px)`; keep both in step. */
export const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function isDesktopNow() {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

/** True on a screen at least 1024px wide; updates live when the window is resized. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, isDesktopNow);
}