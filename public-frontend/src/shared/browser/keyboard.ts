/**
 * Tracks the on-screen keyboard on phones. iOS does not shrink the page when the keyboard
 * opens; it covers the bottom of it. visualViewport is the part of the page actually on
 * screen, so the gap between its bottom and the window's bottom is what the keyboard covers.
 *
 * Sets on <html>:
 * - the CSS variable --keyboard-inset: that height in px (0 while the keyboard is closed);
 * - data-keyboard="open" while the keyboard is up.
 */

// A smaller gap is the browser's own bars moving, not a keyboard.
const KEYBOARD_MIN_PX = 120;
// The keyboard opens over a few frames; it counts as open once it stopped resizing this long.
const SETTLE_MS = 100;
// No keyboard (a computer, or it was already open) sends no resize; measure after this.
const NO_KEYBOARD_MS = 400;
// Room left between a revealed element and the edges of the visible part.
const REVEAL_GAP_PX = 8;

/** Call once, at startup. */
export function trackKeyboard(): void {
  const viewport = window.visualViewport;
  if (!viewport) return; // an old browser: the page works as it did before
  const root = document.documentElement;
  let frame = 0;

  const update = () => {
    frame = 0;
    // The page's height, which the keyboard does not change. Not window.innerHeight:
    // on iPhone that follows the visible part, so it shrinks with the keyboard too.
    const pageHeight = root.clientHeight;
    const gap = pageHeight - viewport.height - viewport.offsetTop;
    // Pinch zoom also makes the visible part smaller; that is not a keyboard.
    const open = viewport.scale < 1.05 && gap > KEYBOARD_MIN_PX;
    root.style.setProperty("--keyboard-inset", `${open ? Math.round(gap) : 0}px`);
    if (open) root.dataset.keyboard = "open";
    else delete root.dataset.keyboard;
  };

  // At most one update per frame, however many events fire while the page scrolls.
  const schedule = () => {
    if (frame === 0) frame = requestAnimationFrame(update);
  };

  viewport.addEventListener("resize", schedule);
  viewport.addEventListener("scroll", schedule);
  update();
}

/**
 * Once the keyboard has opened, makes sure `element` is in sight between the top of the
 * screen and the bar at the bottom (as WhatsApp keeps the message you answer in view).
 * Scrolls only if it is hidden. `getBar` is asked only then, because the bar may not
 * exist yet when this is called.
 */
export function keepInSight(element: HTMLElement, getBar: () => Element | null | undefined): void {
  const viewport = window.visualViewport;
  let settle = 0;

  const reveal = () => {
    viewport?.removeEventListener("resize", onResize);
    window.clearTimeout(fallback);
    if (!element.isConnected) return; // the message went away meanwhile

    // Positions relative to the page's window. On iPhone the visible part starts
    // offsetTop below its top, and ends where the bar (sitting on the keyboard) begins.
    const top = (viewport?.offsetTop ?? 0) + REVEAL_GAP_PX;
    const barTop = getBar()?.getBoundingClientRect().top;
    const bottom = (barTop ?? viewport?.height ?? window.innerHeight) - REVEAL_GAP_PX;
    const box = element.getBoundingClientRect();
    if (box.top >= top && box.bottom <= bottom) return; // already in sight

    // Its end right above the bar; one taller than the free space shows from its start.
    const by = box.height > bottom - top ? box.top - top : box.bottom - bottom;
    window.scrollBy({ top: by, behavior: "smooth" });
  };

  const onResize = () => {
    window.clearTimeout(fallback);
    window.clearTimeout(settle);
    settle = window.setTimeout(reveal, SETTLE_MS);
  };

  viewport?.addEventListener("resize", onResize);
  const fallback = window.setTimeout(reveal, NO_KEYBOARD_MS);
}