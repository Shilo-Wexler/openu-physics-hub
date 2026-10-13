/**
 * One writing bar at the bottom of a course page, as in TikTok and WhatsApp. Pressing
 * "reply" does not open a second box inside the list: the bottom bar switches to
 * "replying to X". This context says which message is being answered, and where the bar is.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import type { Reply, Review } from "../../shared/api/chat";

interface ReplyTarget {
  /** The review whose thread gets the reply. */
  reviewId: number;
  /** What is answered: the review itself, or a reply inside its thread (which gets quoted). */
  message: Review | Reply;
}

interface ReplyBar {
  /** The reply being written, or null while the bar writes a new review. */
  target: ReplyTarget | null;
  startReply: (target: ReplyTarget) => void;
  stopReply: () => void;
  /** The element at the bottom of the list that shows the reply box (through a portal). */
  slot: HTMLElement | null;
  setSlot: (element: HTMLElement | null) => void;
}

const ReplyBarContext = createContext<ReplyBar | null>(null);

export function ReplyBarProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ReplyTarget | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // The same object between renders unless something changed, so readers do not re-render for nothing.
  const value = useMemo(
    () => ({ target, startReply: setTarget, stopReply: () => setTarget(null), slot, setSlot }),
    [target, slot],
  );
  return <ReplyBarContext.Provider value={value}>{children}</ReplyBarContext.Provider>;
}

export function useReplyBar(): ReplyBar {
  const bar = useContext(ReplyBarContext);
  if (!bar) throw new Error("useReplyBar must be used inside ReplyBarProvider");
  return bar;
}