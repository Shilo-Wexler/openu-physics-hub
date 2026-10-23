/** Anonymous inquiries from the public site's form: the queue with its filters, and one inquiry's panel. */

import { useState } from "react";

import { listCourses } from "../../api/courses";
import { INQUIRY_TYPES, listInquiries, type InquiryStatus, type InquiryType } from "../../api/inquiries";
import { formatDateTime } from "../../lib/format";
import { useAdmin, useLoad } from "./context";
import InquiryDetail, { TYPE_LABEL, courseLabel, rowClass } from "./InquiryDetail";
import LoadError from "./LoadError";

type View = InquiryStatus | "all";

const VIEWS: { id: View; label: string }[] = [
  { id: "new", label: "חדשות" },
  { id: "in_progress", label: "בטיפול" },
  { id: "closed", label: "סגורות" },
  { id: "all", label: "הכל" },
];

export default function InquiriesTab() {
  const { token, version } = useAdmin();
  const [view, setView] = useState<View>("new");
  const [type, setType] = useState<InquiryType | "">("");
  // A course number, or null for every course.
  const [course, setCourse] = useState<number | null>(null);
  // The `before` of every page up to the current one (empty on the first page), so "newer" can go back.
  const [cursors, setCursors] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  const courses = useLoad((signal) => listCourses(token, signal), [token]);
  const before = cursors[cursors.length - 1];
  const list = useLoad(
    (signal) =>
      listInquiries(
        token,
        { status: view === "all" ? undefined : view, type: type || undefined, course: course ?? undefined, before },
        signal,
      ),
    [token, view, type, course, before, version],
  );
  const nextBefore = list.data?.next_before ?? null;

  // Any filter change goes back to the first page.
  function changeView(next: View) {
    setView(next);
    setCursors([]);
  }
  function changeType(next: InquiryType | "") {
    setType(next);
    setCursors([]);
  }
  function changeCourse(next: string) {
    setCourse(next === "" ? null : Number(next));
    setCursors([]);
  }

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

          <select
            value={course ?? ""}
            onChange={(e) => changeCourse(e.target.value)}
            aria-label="סינון לפי קורס"
          >
            <option value="">כל הקורסים</option>
            {courses.data
              ?.filter((c) => c.course_number !== null)
              .map((c) => (
                <option key={c.course_number} value={c.course_number ?? ""}>
                  {courseLabel(c.course_number, c.name)}
                </option>
              ))}
          </select>

          <select
            value={type}
            onChange={(e) => changeType(e.target.value as InquiryType | "")}
            aria-label="סינון לפי סוג"
          >
            <option value="">כל הסוגים</option>
            {INQUIRY_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        <LoadError loaded={list} what="הפניות" />
        {list.data && list.data.items.length === 0 && <p className="muted empty">אין פניות להצגה.</p>}

        {list.data && list.data.items.length > 0 && (
          <div className="table-wrap">
            <table className="requests-table">
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>קורס</th>
                  <th>סוג</th>
                  <th>תקציר</th>
                  <th>מטפל</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((inquiry) => (
                  <tr
                    key={inquiry.id}
                    className={[rowClass(inquiry.status), selected === inquiry.id && "selected"].filter(Boolean).join(" ")}
                    onClick={() => setSelected(inquiry.id)}
                  >
                    <td className="nowrap">{formatDateTime(inquiry.created_at)}</td>
                    <td>{courseLabel(inquiry.course_number, inquiry.course_name)}</td>
                    <td className="nowrap">{TYPE_LABEL[inquiry.type]}</td>
                    <td className="preview">{inquiry.content}</td>
                    <td>{inquiry.handled_by ? <bdi dir="ltr">{inquiry.handled_by}</bdi> : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(cursors.length > 0 || nextBefore !== null) && (
          <div className="pager">
            <button className="btn" disabled={cursors.length === 0} onClick={() => setCursors((c) => c.slice(0, -1))}>
              חדשות יותר
            </button>
            <span className="muted">עמוד {cursors.length + 1}</span>
            <button
              className="btn"
              disabled={nextBefore === null}
              onClick={() => nextBefore !== null && setCursors((c) => [...c, nextBefore])}
            >
              ישנות יותר
            </button>
          </div>
        )}
      </section>

      {selected !== null && <InquiryDetail key={selected} id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
