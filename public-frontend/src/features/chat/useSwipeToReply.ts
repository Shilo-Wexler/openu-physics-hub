/**
 * Swipe to reply on touch screens, as in WhatsApp: drag a message toward the end of the line
 * (left in Hebrew) and let go past SWIPE_TRIGGER. Desktop keeps the reply button only.
 *
 * The moving parts of the message carry data-swipe-area; their container gets --swipe (the
 * offset in px) and --swipe-progress (0 to 1) for the CSS to use. While dragging the styles
 * are set directly on the element, not through React state, so a drag never re-renders.
 *
 * Touch events and not pointer events: once a drag is clearly sideways, touchmove can call
 * preventDefault() so the page does not start scrolling and take the touch away halfway.
 * React only adds passive touch listeners, which cannot do that, so they are added here.
 */

import { useEffect, useRef } from "react";
import type { MouseEvent, RefObject } from "react";

// How far to drag before letting go starts a reply.
const SWIPE_TRIGGER = 56;
// Past the trigger the message follows the finger slowly, up to this far.
const SWIPE_MAX = 80;
// A shorter move is still a tap, or the start of a scroll.
const SWIPE_SLOP = 8;

interface Gesture {
  startX: number;
  startY: number;
  sign: 1 | -1; // -1 on a right-to-left page: the end of the line is on the left
  swiping: boolean; // false until the move is clearly sideways
  ready: boolean; // past the trigger
}

export function useSwipeToReply(
  container: RefObject<HTMLElement | null>,
  onSwipe: (() => void) | undefined,
) {
  // The latest onSwipe, so the listeners below never call an old one.
  const onSwipeRef = useRef(onSwipe);
  useEffect(() => {
    onSwipeRef.current = onSwipe;
  });
  // Set when a swipe just ended, so the click the browser may fire right after it is ignored.
  const swiped = useRef(false);

  const enabled = onSwipe !== undefined;

  useEffect(() => {
    const element = container.current;
    if (!enabled || !element) return;
    let gesture: Gesture | null = null;

    function reset() {
      gesture = null;
      if (!element) return;
      delete element.dataset.swiping;
      delete element.dataset.swipeReady;
      element.style.removeProperty("--swipe");
      element.style.removeProperty("--swipe-progress");
    }

    function onTouchStart(event: TouchEvent) {
      swiped.current = false;
      gesture = null;
      const touch = event.touches[0];
      if (!element || !touch || event.touches.length !== 1) return;
      const target = event.target as Element;
      // Only this message's own parts: a reply inside a review's thread is a message of its
      // own, so the review ignores touches that start there.
      const area = target.closest("[data-swipe-area]");
      if (!area || area.closest("article") !== element) return;
      // Text boxes keep their own touch behavior (moving the caret, selecting text).
      if (target.closest("textarea, input")) return;

      gesture = {
        startX: touch.clientX,
        startY: touch.clientY,
        sign: getComputedStyle(element).direction === "rtl" ? -1 : 1,
        swiping: false,
        ready: false,
      };
    }

    function onTouchMove(event: TouchEvent) {
      const touch = event.touches[0];
      if (!gesture || !element) return;
      if (!touch || event.touches.length !== 1) {
        reset(); // a second finger: a pinch, not a swipe
        return;
      }

      const along = (touch.clientX - gesture.startX) * gesture.sign; // toward the end of the line
      const across = Math.abs(touch.clientY - gesture.startY);

      if (!gesture.swiping) {
        if (Math.abs(along) < SWIPE_SLOP && across < SWIPE_SLOP) return;
        // Mostly up or down, or toward the start of the line: not a swipe, the page scrolls.
        if (along <= 0 || across > along) {
          gesture = null;
          return;
        }
        gesture.swiping = true;
        element.dataset.swiping = "";
      }

      // The drag is ours now: the page must not scroll along with it.
      if (event.cancelable) event.preventDefault();

      const distance = Math.max(0, along);
      const offset =
        distance <= SWIPE_TRIGGER
          ? distance
          : Math.min(SWIPE_MAX, SWIPE_TRIGGER + (distance - SWIPE_TRIGGER) / 3);

      const ready = offset >= SWIPE_TRIGGER;
      if (ready !== gesture.ready) {
        gesture.ready = ready;
        if (ready) {
          element.dataset.swipeReady = "";
          // A short buzz where supported (Android); iPhones have no vibration API.
          if ("vibrate" in navigator) navigator.vibrate(10);
        } else {
          delete element.dataset.swipeReady;
        }
      }

      element.style.setProperty("--swipe", `${offset * gesture.sign}px`);
      element.style.setProperty("--swipe-progress", String(Math.min(1, offset / SWIPE_TRIGGER)));
    }

    function onTouchEnd() {
      const ended = gesture;
      reset();
      if (!ended?.swiping) return; // a tap: the click goes through as usual
      swiped.current = true;
      if (ended.ready) onSwipeRef.current?.();
    }

    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchend", onTouchEnd);
    element.addEventListener("touchcancel", reset);
    return () => {
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchcancel", reset);
      reset();
    };
    // `enabled` also re-attaches the listeners when a message comes back after a failed
    // delete, since the article element is then a new one.
  }, [container, enabled]);

  function onClickCapture(event: MouseEvent<HTMLElement>) {
    if (!swiped.current) return;
    swiped.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  return { onClickCapture };
}
