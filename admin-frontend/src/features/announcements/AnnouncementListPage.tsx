/** The announcements: the one on the home page, the drafts, then the published ones, newest first.
    A row opens the announcement as a form; the round "+" starts a new one. On a computer the form opens
    beside the list (see SplitView), and the first announcement opens by itself. */

import { useEffect, useState, type MouseEvent } from "react";
import { Link, useMatch, useNavigate } from "react-router";

import { listAnnouncements, type AdminAnnouncement } from "../../shared/api/announcements";
import { isAbort, isAuthError } from "../../shared/api/client";
import { ListMessage, ListRow, LoadMore, RowList } from "../../shared/components/ListRow";
import { positionText, useAutoOpen, useReportPosition, useSplit } from "../../shared/components/SplitView";
import { errorMessage } from "../../shared/lib/errors";
import { useAdmin } from "../../layout/consoleContext";
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

const NEW_PATH = "/announcements/new";

/** The round "+" that starts a new announcement. On a computer it sits beside the title (SplitView draws
    it there) while a form may be open beside the list, so unsaved changes there ask first. */
export function NewAnnouncementLink() {
  const { isDirty, confirmLeave } = useSplit();
  const navigate = useNavigate();

  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (!isDirty()) return;
    event.preventDefault();
    void confirmLeave().then((ok) => {
      if (ok) navigate(NEW_PATH);
    });
  }

  return (
    <Link to={NEW_PATH} className={styles.add} aria-label="הכרזה חדשה" onClick={open}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </Link>
  );
}

export default function AnnouncementListPage() {
  const { token, version, onAuthError } = useAdmin();
  const { split } = useSplit();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // version: back from a saved or deleted announcement, the list starts again from the first page.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listAnnouncements(token, 1, controller.signal)
      .then((page) => {
        setLoaded({ items: page.items, page: 1, total: page.total });
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (isAbort(e)) return;
        if (isAuthError(e)) onAuthError();
        else setError(errorMessage(e));
        setLoading(false);
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
      else setError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }

  const items = loaded?.items ?? [];
  const hasMore = loaded !== null && items.length < loaded.total;

  // On a computer with nothing open, the first announcement (the one on the home page) opens beside the list.
  const first = items[0];
  useAutoOpen(first ? `/announcements/${first.id}` : null, loading, version);

  // Where the open announcement sits in the list, shown above it on a computer: "הכרזה 2 מתוך 6".
  // The groups follow the server's order, so the place in `items` is the place on screen.
  const openId = Number(useMatch("/announcements/:id")?.params.id);
  const index = items.findIndex((a) => a.id === openId);
  useReportPosition(positionText("הכרזה", index, loaded?.total));

  return (
    <>
      {/* On a computer the title and the "+" sit above the list-and-form window (SplitView draws them). */}
      {!split && (
        <header className={styles.head}>
          <h1>הכרזות</h1>
          <NewAnnouncementLink />
        </header>
      )}

      {error && <p className="error">{error}</p>}

      {!loaded ? (
        !error && <ListMessage>טוען…</ListMessage>
      ) : items.length === 0 ? (
        <ListMessage>עוד אין הכרזות.</ListMessage>
      ) : (
        <Groups loaded={loaded} />
      )}
      {hasMore && <LoadMore loading={loadingMore} onClick={() => void loadMore()} />}
    </>
  );
}

/** The three groups. The server sends pinned, then drafts, then published, so the first two are always
    loaded whole, and the published count is what is left of the total (also the pages not loaded yet). */
function Groups({ loaded }: { loaded: Loaded }) {
  const pinned = loaded.items.filter((a) => a.pinned);
  const drafts = loaded.items.filter((a) => !a.published_at);
  const published = loaded.items.filter((a) => a.published_at && !a.pinned);
  return (
    <>
      <AnnouncementGroup title="בדף הבית" items={pinned} count={pinned.length} />
      <AnnouncementGroup title="טיוטות" items={drafts} count={drafts.length} />
      <AnnouncementGroup title="פורסמו" items={published} count={loaded.total - pinned.length - drafts.length} />
    </>
  );
}

interface GroupProps {
  title: string;
  items: AdminAnnouncement[];
  count: number;
}

/** A group's title bar, with how many it holds; on a computer it stays at the top while its rows scroll. */
function AnnouncementGroup({ title, items, count }: GroupProps) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className={styles.groupTitle}>
        {title}
        <span className={styles.groupCount}>{count}</span>
      </h2>
      <RowList>
        {items.map((a) => (
          <AnnouncementRow key={a.id} announcement={a} />
        ))}
      </RowList>
    </section>
  );
}

/** What the second line says when the row has no text of its own to show, so every row has two lines
    and the same height. */
function secondLine(a: AdminAnnouncement): string {
  // Without a title the text already names the row, so it is not repeated under it.
  if (a.title && a.body) return a.body;
  if (!a.title && a.body) return "בלי כותרת";
  return a.image ? "תמונה בלי טקסט" : "בלי טקסט";
}

/** The picture, or a grey square with a text icon in its place, so every title starts at the same line.
    Then the name, the date, and one line under it (see secondLine). */
function AnnouncementRow({ announcement: a }: { announcement: AdminAnnouncement }) {
  return (
    <ListRow
      to={`/announcements/${a.id}`}
      leading={
        a.image ? (
          <TokenImage image={a.image} alt="" className={styles.thumb} />
        ) : (
          <span className={`${styles.thumb} ${styles.noImage}`}>
            {/* Lines of text, like a page with no picture. */}
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 6h14M5 10h14M5 14h9M5 18h6" />
            </svg>
          </span>
        )
      }
      title={<bdi>{announcementName(a)}</bdi>}
      // A draft has no publish date yet: the day it was written.
      time={a.published_at ?? a.created_at}
      preview={<span className={styles.oneLine}>{secondLine(a)}</span>}
    />
  );
}
