/** /announcements: everything the committee published, pinned first, 20 at a time.
    On a desktop the cards fill three columns, the pinned one first. */

import { useEffect, useState } from "react";

import { listAnnouncements, type Announcement } from "../../shared/api/announcements";
import { isAbort } from "../../shared/api/client";
import AnnouncementCard from "./AnnouncementCard";
import styles from "./AnnouncementsPage.module.css";

type FirstPage =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: Announcement[]; nextBefore: string | null };

export default function AnnouncementsPage() {
  const [page, setPage] = useState<FirstPage>({ status: "loading" });
  // Bumped by "try again", which runs the first load again.
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setPage({ status: "loading" });
    listAnnouncements(undefined, controller.signal)
      .then((result) =>
        setPage({ status: "ready", items: result.announcements, nextBefore: result.next_before }),
      )
      .catch((error: unknown) => {
        if (isAbort(error)) return;
        console.error(error);
        setPage({ status: "error" });
      });
    return () => controller.abort();
  }, [attempt]);

  async function loadMore() {
    if (page.status !== "ready" || page.nextBefore === null || loadingMore) return;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const result = await listAnnouncements(page.nextBefore);
      setPage((current) => {
        if (current.status !== "ready") return current;
        // Skip any announcement already shown (for example one pinned in the meantime).
        const shown = new Set(current.items.map((item) => item.id));
        const added = result.announcements.filter((item) => !shown.has(item.id));
        return { status: "ready", items: [...current.items, ...added], nextBefore: result.next_before };
      });
    } catch (error) {
      console.error(error);
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>הכרזות</h1>
        <p className={styles.subtitle}>עדכונים מוועד הסטודנטים</p>
      </header>

      {page.status === "loading" && <p className={styles.note}>טוען הכרזות…</p>}

      {page.status === "error" && (
        <div className={styles.note} role="alert">
          <p>לא הצלחנו לטעון את ההכרזות.</p>
          <button type="button" className={styles.button} onClick={() => setAttempt((n) => n + 1)}>
            לנסות שוב
          </button>
        </div>
      )}

      {page.status === "ready" && page.items.length === 0 && (
        <p className={styles.note}>אין הכרזות כרגע.</p>
      )}

      {page.status === "ready" && page.items.length > 0 && (
        <>
          <div className={styles.list}>
            {page.items.map((announcement) => (
              <AnnouncementCard key={announcement.id} announcement={announcement} />
            ))}
          </div>

          {page.nextBefore !== null && (
            <div className={styles.more}>
              {moreFailed && (
                <p className={styles.error} role="alert">
                  לא הצלחנו לטעון עוד הכרזות.
                </p>
              )}
              <button
                type="button"
                className={styles.button}
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? "טוען…" : "עוד הכרזות"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

