/** The inquiries queue: a status switch, course and type filters, and the newest inquiries first. */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { isAbort, isAuthError } from "../../api/client";
import {
  getInquiryCounts,
  listInquiries,
  type Inquiry,
  type InquiryFilters,
  type InquiryType,
} from "../../api/inquiries";
import { ListMessage, ListRow, LoadMore, RowList } from "../../components/ListRow";
import SegmentedControl from "../../components/SegmentedControl";
import { courseLabel, STATUS_LABEL, TYPE_LABEL } from "../../lib/inquiryLabels";
import { actionError, useAdmin, useLoad } from "../admin/context";
import CourseFilter from "./CourseFilter";
import { filtersSearch, readFilters, type Filters, type View } from "./filters";
import styles from "./InquiriesPage.module.css";
import { cachedPage, rememberPage } from "./listCache";
import TypeFilter from "./TypeFilter";

const VIEWS: { value: View; label: string }[] = [
  { value: "new", label: "חדשות" },
  { value: "in_progress", label: "בטיפול" },
  { value: "closed", label: "סגורות" },
  { value: "all", label: "הכל" },
];

export default function InquiriesPage() {
  const { token, version } = useAdmin();
  const [params] = useSearchParams();
  const navigate = useNavigate();
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
  function changeView(view: View) {
    navigate(`/inquiries${filtersSearch({ ...filters, view })}`, { replace: true });
  }
  function changeCourse(course: number | null) {
    navigate(`/inquiries${filtersSearch({ ...filters, course })}`, { replace: true });
  }
  function changeType(type: InquiryType | null) {
    navigate(`/inquiries${filtersSearch({ ...filters, type })}`, { replace: true });
  }

  return (
    <>
      <h1>פניות</h1>

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

      <InquiryList filters={filters} search={search} />
    </>
  );
}

interface ListProps {
  filters: Filters;
  /** The filters as a query string: the list's identity, and passed on so an inquiry's back link returns here. */
  search: string;
}

/** What is on screen: the first page(s) of the list for `search`. While another list loads, the previous one
    stays (dimmed) instead of a "loading" line, so switching views doesn't flash. */
interface Shown {
  search: string;
  items: Inquiry[];
  nextBefore: number | null;
}

function InquiryList({ filters, search }: ListProps) {
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
        else setError(actionError(e));
        setLoading(false);
      });
    return () => controller.abort();
    // `search` stands for the filters (query is built from them); version reloads after every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, search, version, onAuthError]);

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
      else setError(actionError(e));
    } finally {
      setLoadingMore(false);
    }
  }

  // The list on screen belongs to other filters and the right one is on its way.
  const stale = shown !== null && shown.search !== search;

  if (!shown) {
    if (error) return <p className="error">{error}</p>;
    return <ListMessage>{loading ? "טוען..." : "אין פניות להצגה."}</ListMessage>;
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

/** One row, like an email in a mail app: a blue dot while new, type and time, course, the start of the text. */
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
          {courseLabel(inquiry.course_number, inquiry.course_name)}
          {showStatus && ` · ${STATUS_LABEL[inquiry.status]}`}
        </>
      }
      preview={inquiry.content}
    />
  );
}
