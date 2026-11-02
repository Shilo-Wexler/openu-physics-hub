import { useSyncExternalStore } from "react";

// Desktop starts here. Tablets and phones keep the one-page-at-a-time layout.
const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function isDesktopNow(): boolean {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

/** True on a wide screen; updates when the window is resized. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, isDesktopNow);
}