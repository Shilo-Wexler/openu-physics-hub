import { useState, type FormEvent } from "react";

import { listAdminCourses, listRequests, type RequestFilters } from "../../api/requests";
import { formatDateTime } from "../../lib/format";
import { useAdmin, useLoad } from "./context";
import LoadError from "./LoadError";
import RequestDetail from "./RequestDetail";
import StateSwatch, { stateOf } from "./RequestState";

type View = "unread" | "open" | "closed" | "all";

const VIEWS: { id: View; label: string }[] = [
  { id: "unread", label: "לא נקראו" },
  { id: "open", label: "בטיפול" },
  { id: "closed", label: "סגורות" },
  { id: "all", label: "הכל" },
];

/** The unread queue is oldest first (handle in order); the other views show the newest first. */
function filtersFor(view: View): RequestFilters {
  switch (view) {
    case "unread":
      return { is_opened: false, sort: "oldest" };
    case "open":
      return { is_opened: true, status: "new" };
    case "closed":
      return { status: "closed" };
    case "all":
      return {};
  }
}

const PAGE_SIZE = 20;

export default function RequestsTab() {
  const { token, version } = useAdmin();
  const [view, setView] = useState<View>("unread");
  const [course, setCourse] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [email, setEmail] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);

  const courses = useLoad((signal) => listAdminCourses(token, signal), [token]);
  const list = useLoad(
    (signal) =>
      listRequests(
        token,
        { ...filtersFor(view), course_name: course || undefined, email: email || undefined, page, page_size: PAGE_SIZE },
        signal,
      ),
    [token, view, course, email, page, version],
  );

  // Any filter change goes back to page 1.
  function changeView(next: View) {
    setView(next);
    setPage(1);
  }
  function changeCourse(next: string) {
    setCourse(next);
    setPage(1);
  }
  function searchEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmail(emailInput.trim());
    setPage(1);
  }

  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className={selected === null ? "requests-layout" : "requests-layout with-detail"}>
      <section>
        <div className="filters">
          <div className="segmented">
            {VIEWS.map((v) => (
              <button key={v.id} className={view === v.id ? "active" : ""} onClick={() => changeView(v.id)}>
                {v.label}
              </button>
            ))}
          </div>

          <select value={course} onChange={(e) => changeCourse(e.target.value)} aria-label="סינון לפי קורס">
            <option value="">כל הקורסים</option>
            {courses.data?.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>

          <form onSubmit={searchEmail} className="inline-form">
            <input
              type="search"
              dir="ltr"
              placeholder="חיפוש לפי מייל"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
            />
            <button className="btn" type="submit">
              חיפוש
            </button>
          </form>
        </div>

        <div className="legend" aria-label="מקרא">
          <StateSwatch state="new" />
          <StateSwatch state="open" />
          <StateSwatch state="closed" />
        </div>

        <LoadError loaded={list} what="הפניות" />
        {list.data && list.data.items.length === 0 && <p className="muted empty">אין פניות להצגה.</p>}

        {list.data && list.data.items.length > 0 && (
          <div className="table-wrap">
            <table className="requests-table">
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>שם</th>
                  <th>קורס</th>
                  <th>תקציר</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((r) => (
                  <tr
                    key={r.id}
                    className={[`state-${stateOf(r.status, r.is_opened)}`, selected === r.id && "selected"]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setSelected(r.id)}
                  >
                    <td className="nowrap">{formatDateTime(r.created_at)}</td>
                    <td>{r.full_name}</td>
                    <td>{r.course_name}</td>
                    <td className="preview">{r.preview}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE_SIZE && (
          <div className="pager">
            <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              הקודם
            </button>
            <span className="muted">
              עמוד {page} מתוך {pages} ({total} פניות)
            </span>
            <button className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              הבא
            </button>
          </div>
        )}
      </section>

      {selected !== null && <RequestDetail key={selected} id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
