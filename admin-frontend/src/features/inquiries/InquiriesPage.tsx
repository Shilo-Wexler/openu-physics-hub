/** The inquiries queue: a status switch, course and type filters, and the newest inquiries first. */

import { useEffect, useState } from "react";
import { useMatch, useNavigate, useSearchParams } from "react-router";

import { isAbort, isAuthError } from "../../shared/api/client";
import {
  getInquiryCounts,
  listInquiries,
  type Inquiry,
  type InquiryFilters,
  type InquiryType,
} from "../../shared/api/inquiries";
import { ListMessage, ListRow, LoadMore, RowList } from "../../shared/components/ListRow";
import SegmentedControl from "../../shared/components/SegmentedControl";
import { ListHead, positionText, useAutoOpen, useReportPosition, useSplit } from "../../shared/components/SplitView";
import { courseLabel, STATUS_LABEL, TYPE_LABEL } from "../../shared/lib/inquiryLabels";
import { errorMessage } from "../../shared/lib/errors";
import { useAdmin, useLoad } from "../../layout/consoleContext";
import CourseFilter from "./CourseFilter";
import { filtersSearch, readFilters, type Filters, type View } from "./filters";
import styles from "./InquiriesPage.module.css";
import { cachedPage, rememberPage } from "./listCache";
import TypeFilter from "./TypeFilter";

const VIEWS: { value: View; label: string }[] = [
  { value: "new", label: "חדשות" },
  { value: "in_progress", label: "בטיפול" },
  { value: "closed", label: "סגורות" },
  { value: "all", label: "הכול" },
];

export default function InquiriesPage() {
  const { token, version } = useAdmin();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { split, confirmLeave } = useSplit();
  const filters = readFilters(params);
  const search = filtersSearch(filters);
  const filtered = filters.course !== null || filters.type !== null;

  const counts = useLoad((signal) => getInquiryCounts(token, signal), [token, version]);

  // The counts are for all courses and types, so with a filter on they would not match the list: hidden then.
  function countFor(view: View): number | undefined {
    if (filtered || !counts.data) return undefined;
    const { new: fresh, in_progress, closed } = counts.data;
    return view === "all" ? fresh + in_progress + closed : counts.data[view];
  }

  // replace: switching views or filters should not fill the back button's history.
  // On a computer an inquiry may be open beside the list: a new list closes it, so unsaved changes ask first.
  async function show(next: Filters) {
    if (await confirmLeave()) navigate(`/inquiries${filtersSearch(next)}`, { replace: true });
  }
  function changeView(view: View) {
    void show({ ...filters, view });
  }
  function changeCourse(course: number | null) {
    void show({ ...filters, course });
  }
  function changeType(type: InquiryType | null) {
    void show({ ...filters, type });
  }

  return (
    <>
      {/* On a computer the title sits above the list-and-inquiry window (SplitView draws it). */}
      {!split && <h1>פניות</h1>}

      {/* The switch and the filters. On a computer they stay at the top while the rows scroll under them. */}
      <ListHead>
        <SegmentedControl
          label="מצב הפניות"
          segments={VIEWS.map((v) => ({ ...v, count: countFor(v.value) }))}
          value={filters.view}
          onChange={changeView}
        />

        {/* Both filters in one row, so as many inquiries as possible fit on the screen.
            The row is also the box the course results open over (see CourseFilter.module.css). */}
        <div className={styles.filters}>
          <CourseFilter value={filters.course} onChange={changeCourse} />
          <TypeFilter value={filters.type} onChange={changeType} />
        </div>
      </ListHead>

      <InquiryList filters={filters} search={search} total={countFor(filters.view)} />
    </>
  );
}

interface ListProps {
  filters: Filters;
  /** The filters as a query string: the list's identity, and passed on so an inquiry's back link returns here. */
  search: string;
  /** How many inquiries the view holds, when known (not with a filter on). */
  total: number | undefined;
}

/** What is on screen: the first page(s) of the list for `search`. While another list loads, the previous one
    stays (dimmed) instead of a "loading" line, so switching views doesn't flash. */
interface Shown {
  search: string;
  items: Inquiry[];
  nextBefore: number | null;
}

function InquiryList({ filters, search, total }: ListProps) {
  const { token, version, onAuthError } = useAdmin();
  const [shown, setShown] = useState<Shown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const query: InquiryFilters = {
    status: filters.view === "all" ? undefined : filters.view,
    type: filters.type ?? undefined,
    course: filters.course ?? undefined,
  };

  useEffect(() => {
    // A list seen before shows at once; the request below then refreshes it.
    const cached = cachedPage(search, version);
    if (cached) setShown({ search, items: cached.items, nextBefore: cached.next_before });
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    listInquiries(token, query, controller.signal)
      .then((page) => {
        rememberPage(search, version, page);
        setShown({ search, items: page.items, nextBefore: page.next_before });
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (isAbort(e)) return;
        if (isAuthError(e)) onAuthError();
        else setError(errorMessage(e));
        setLoading(false);
      });
    return () => controller.abort();
    // `search` stands for the filters (query is built from them); version reloads after every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, search, version, onAuthError]);

  // On a computer with nothing open, the newest inquiry opens beside the list; after a save, the next one.
  // A list of other filters (still on screen while the right one loads) is not this list.
  const first = shown?.search === search ? shown.items[0] : undefined;
  useAutoOpen(first ? `/inquiries/${first.id}${search}` : null, loading, version);

  // Where the open inquiry sits in this list, shown above it on a computer: "פנייה 2 מתוך 9".
  const openId = Number(useMatch("/inquiries/:id")?.params.id);
  const index = shown?.items.findIndex((inquiry) => inquiry.id === openId) ?? -1;
  // Without a count (a filter is on), the loaded rows are the whole list once there is no next page.
  const of = total ?? (shown?.nextBefore === null ? shown.items.length : undefined);
  useReportPosition(positionText("פנייה", index, of));

  async function loadMore() {
    if (!shown || shown.nextBefore === null) return;
    const from = shown;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await listInquiries(token, { ...query, before: from.nextBefore ?? undefined });
      // Only if the same list is still on screen (the filters may have changed meanwhile).
      setShown((current) =>
        current?.search === from.search
          ? { search: from.search, items: [...current.items, ...page.items], nextBefore: page.next_before }
          : current,
      );
    } catch (e) {
      if (isAuthError(e)) onAuthError();
      else setError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }

  // The list on screen belongs to other filters and the right one is on its way.
  const stale = shown !== null && shown.search !== search;

  if (!shown) {
    if (error) return <p className="error">{error}</p>;
    return <ListMessage>{loading ? "טוען…" : "אין פניות להצגה."}</ListMessage>;
  }

  return (
    <div className={stale ? styles.stale : undefined} aria-busy={stale}>
      {error && <p className="error">{error}</p>}

      {shown.items.length === 0 ? (
        <ListMessage>אין פניות להצגה.</ListMessage>
      ) : (
        <RowList>
          {shown.items.map((inquiry) => (
            <InquiryRow key={inquiry.id} inquiry={inquiry} search={search} showStatus={filters.view === "all"} />
          ))}
        </RowList>
      )}

      {shown.nextBefore !== null && <LoadMore loading={loadingMore} disabled={stale} onClick={loadMore} />}
    </div>
  );
}

interface RowProps {
  inquiry: Inquiry;
  search: string;
  /** In the "all" view the status is not known from the view, so the row says it. */
  showStatus: boolean;
}

/** One row, like an email in a mail app: a blue dot while new, type and time, course, the start of the text.
    A small phone before the course marks an inquiry the sender left contact details on. */
function InquiryRow({ inquiry, search, showStatus }: RowProps) {
  const isNew = inquiry.status === "new";
  return (
    <ListRow
      to={`/inquiries/${inquiry.id}${search}`}
      leading={<span className={isNew ? `${styles.dot} ${styles.unread}` : styles.dot} aria-hidden="true" />}
      title={TYPE_LABEL[inquiry.type]}
      strong={isNew}
      time={inquiry.created_at}
      subtitle={
        <>
          {inquiry.has_contact && (
            <span className={styles.contact} role="img" aria-label="עם פרטי קשר" title="עם פרטי קשר">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </span>
          )}
          {courseLabel(inquiry.course_number, inquiry.course_name)}
          {showStatus && ` · ${STATUS_LABEL[inquiry.status]}`}
        </>
      }
      preview={inquiry.content}
    />
  );
}
