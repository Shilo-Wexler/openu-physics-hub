/** A list screen that, on a computer, shows the list and the opened item side by side in one window,
    like a mail app. On a phone the list and the item stay separate screens, as before.
    The routes under it are the items. */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Outlet, useMatch } from "react-router";

import { LEAVE_QUESTION } from "../lib/unsaved";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useConfirm } from "./ConfirmSheet";
import styles from "./SplitView.module.css";

interface SplitContextValue {
  /** True on a computer, where the list is on screen beside the item (so the item needs no back link). */
  split: boolean;
  /** True on a computer while no item is open: the list may open its first item, like a mail app. */
  idle: boolean;
  /** For the list: where the open item sits in it, such as "פנייה 2 מתוך 9", shown above the item. */
  setPosition: (text: string | null) => void;
  /** An item screen's unsaved-changes state; see useReportUnsaved. */
  setDirty: (dirty: boolean) => void;
  /** Whether leaving the open item would lose changes, right now (a link's click must decide at once). */
  isDirty: () => boolean;
  /** Before leaving the open item from the list: true at once when nothing is unsaved, otherwise asks. */
  confirmLeave: () => Promise<boolean>;
}

// Outside a SplitView (screens without one): no list beside, nothing to guard.
const OUTSIDE: SplitContextValue = {
  split: false,
  idle: false,
  setPosition: () => {},
  setDirty: () => {},
  isDirty: () => false,
  confirmLeave: () => Promise.resolve(true),
};

const SplitContext = createContext<SplitContextValue>(OUTSIDE);

export function useSplit(): SplitContextValue {
  return useContext(SplitContext);
}

/** For an item screen: tells the list beside it about unsaved changes, so a click in the list asks first. */
export function useReportUnsaved(dirty: boolean): void {
  const { setDirty } = useSplit();
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
}

/** For the list: says where the open item sits in it (null when unknown). Cleared when the list goes. */
export function useReportPosition(text: string | null): void {
  const { setPosition } = useSplit();
  useEffect(() => {
    setPosition(text);
    return () => setPosition(null);
  }, [text, setPosition]);
}

interface Props {
  /** The list's own path, such as "/inquiries"; any path under it is an open item. */
  base: string;
  /** The screen's title. On a computer it is drawn here, above the window; on a phone the list draws it. */
  title: string;
  list: ReactNode;
  /** Shown beside the list (computer) while no item is open: in practice only when the list is empty. */
  empty: string;
}

export default function SplitView({ base, title, list, empty }: Props) {
  const desktop = useIsDesktop();
  const atList = useMatch({ path: base, end: true }) !== null;
  const ask = useConfirm();
  const [position, setPosition] = useState<string | null>(null);
  // A ref, not state: it changes with every keystroke in the item and the list never needs to re-render for it.
  const dirty = useRef(false);

  const setDirty = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  const isDirty = useCallback(() => dirty.current, []);
  const confirmLeave = useCallback(async () => {
    if (!dirty.current) return true;
    const ok = await ask({ message: LEAVE_QUESTION, action: "יציאה בלי שמירה", cancel: "המשך עריכה", danger: true });
    // Going ahead throws the changes away: no second question on the way out.
    if (ok) dirty.current = false;
    return ok;
  }, [ask]);

  const value = useMemo(
    () => ({ split: desktop, idle: desktop && atList, setPosition, setDirty, isDirty, confirmLeave }),
    [desktop, atList, setDirty, isDirty, confirmLeave],
  );

  if (!desktop) {
    return <SplitContext.Provider value={value}>{atList ? list : <Outlet />}</SplitContext.Provider>;
  }

  return (
    <SplitContext.Provider value={value}>
      <h1>{title}</h1>
      {/* One window: the list on the right, a line, the open item on the left. Each side scrolls on its own. */}
      <div className={styles.window}>
        <div className={styles.list}>{list}</div>
        <div className={styles.item}>
          {atList ? (
            <div className={styles.empty}>
              {/* A tray, like an empty mailbox. */}
              <svg className={styles.emptyIcon} viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 13.5 5.5 5h13l2.5 8.5V19H3z" />
                <path d="M3 13.5h5l1.5 2.5h5l1.5-2.5h5" />
              </svg>
              <p className={styles.emptyText}>{empty}</p>
            </div>
          ) : (
            <>
              {position && <p className={styles.position}>{position}</p>}
              <Outlet />
            </>
          )}
        </div>
      </div>
    </SplitContext.Provider>
  );
}
