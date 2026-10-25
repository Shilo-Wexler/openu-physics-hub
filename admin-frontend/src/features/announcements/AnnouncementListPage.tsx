/** The announcements: the one on the home page, the drafts, then the published ones, newest first.
    A row opens the announcement as a form; the round "+" starts a new one. */

import { useEffect, useState } from "react";
import { Link } from "react-router";

import { listAnnouncements, type AdminAnnouncement } from "../../shared/api/announcements";
import { isAbort, isAuthError } from "../../shared/api/client";
import { ListMessage, ListRow, LoadMore, RowList } from "../../shared/components/ListRow";
import { actionError, useAdmin } from "../../layout/consoleContext";
import styles from "./AnnouncementListPage.module.css";
import { announcementName } from "./labels";
import TokenImage from "./TokenImage";

/** The pages loaded so far. The server sends pinned, then drafts, then published, so every group is
    complete before the next starts, and "load more" only ever adds published ones. */
interface Loaded {
  items: AdminAnnouncement[];
  page: number;
  total: number;
}

export default function AnnouncementListPage() {
  const { token, version, onAuthError } = useAdmin();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // version: back from a saved or deleted announcement, the list starts again from the first page.
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    listAnnouncements(token, 1, controller.signal)
      .then((page) => setLoaded({ items: page.items, page: 1, total: page.total }))
      .catch((e: unknown) => {
        if (isAbort(e)) return;
        if (isAuthError(e)) onAuthError();
        else setError(actionError(e));
      });
    return () => controller.abort();
  }, [token, version, onAuthError]);

  async function loadMore() {
    if (!loaded) return;
    setLoadingMore(true);
    setError(null);
    try {
      const next = await listAnnouncements(token, loaded.page + 1);
      // One published meanwhile shifts the pages by one; an announcement already shown is not added twice.
      const shown = new Set(loaded.items.map((a) => a.id));
      setLoaded({
        items: [...loaded.items, ...next.items.filter((a) => !shown.has(a.id))],
        page: loaded.page + 1,
        total: next.total,
      });
    } catch (e) {
      if (isAuthError(e)) onAuthError();
      else setError(actionError(e));
    } finally {
      setLoadingMore(false);
    }
  }

  const items = loaded?.items ?? [];
  const hasMore = loaded !== null && items.length < loaded.total;

  return (
    <>
      <header className={styles.head}>
        <h1>הכרזות</h1>
        <Link to="/announcements/new" className={styles.add} aria-label="הכרזה חדשה">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Link>
      </header>

      {error && <p className="error">{error}</p>}

      {!loaded ? (
        !error && <ListMessage>טוען...</ListMessage>
      ) : items.length === 0 ? (
        <ListMessage>עוד אין הכרזות.</ListMessage>
      ) : (
        <>
          <AnnouncementGroup title="בדף הבית" items={items.filter((a) => a.pinned)} />
          <AnnouncementGroup title="טיוטות" items={items.filter((a) => !a.published_at)} />
          <AnnouncementGroup title="פורסמו" items={items.filter((a) => a.published_at && !a.pinned)} />
          {hasMore && <LoadMore loading={loadingMore} onClick={loadMore} />}
        </>
      )}
    </>
  );
}

function AnnouncementGroup({ title, items }: { title: string; items: AdminAnnouncement[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className={styles.groupTitle}>{title}</h2>
      <RowList>
        {items.map((a) => (
          <AnnouncementRow key={a.id} announcement={a} />
        ))}
      </RowList>
    </section>
  );
}

/** A small picture when there is one, the name, the date, and the start of the text under a title. */
function AnnouncementRow({ announcement: a }: { announcement: AdminAnnouncement }) {
  return (
    <ListRow
      to={`/announcements/${a.id}`}
      leading={a.image ? <TokenImage image={a.image} alt="" className={styles.thumb} /> : undefined}
      title={<bdi>{announcementName(a)}</bdi>}
      // A draft has no publish date yet: the day it was written.
      time={a.published_at ?? a.created_at}
      // Without a title the text already names the row, so it is not repeated under it.
      preview={a.title ? a.body : undefined}
    />
  );
}
