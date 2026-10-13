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