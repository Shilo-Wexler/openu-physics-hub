/** The meeting summaries, newest meeting first, grouped by year. A row opens the summary;
    the round "+" starts a new one. Opened from the "more" screen. */

import { useEffect, useState } from "react";
import { Link } from "react-router";

import { isAbort, isAuthError } from "../../api/client";
import { listMeetings, type MeetingListItem } from "../../api/meetings";
import BackLink from "../../components/BackLink";
import { Group, Row } from "../../components/GroupedList";
import { ListMessage } from "../../components/ListRow";
import { actionError, useAdmin } from "../admin/context";
import styles from "./MeetingListPage.module.css";
import { formatMeetingDate } from "./meetingDate";

export default function MeetingListPage() {
  const { token, version, onAuthError } = useAdmin();
  const [items, setItems] = useState<MeetingListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // version: back from a saved or deleted summary, the list loads again.
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    listMeetings(token, controller.signal)
      .then((page) => setItems(page.items))
      .catch((e: unknown) => {
        if (isAbort(e)) return;
        if (isAuthError(e)) onAuthError();
        else setError(actionError(e));
      });
    return () => controller.abort();
  }, [token, version, onAuthError]);

  return (
    <>
      <BackLink to="/more" label="עוד" />
      <header className={styles.head}>
        <h1>סיכומי ישיבות</h1>
        <Link to="/more/meetings/new" className={styles.add} aria-label="סיכום חדש">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Link>
      </header>

      {error && <p className="error">{error}</p>}

      {!items ? (
        !error && <ListMessage>טוען...</ListMessage>
      ) : items.length === 0 ? (
        <ListMessage>עוד אין סיכומים.</ListMessage>
      ) : (
        byYear(items).map(([year, meetings]) => (
          <Group key={year} title={year}>
            {meetings.map((m) => (
              <Row
                key={m.id}
                label={<bdi>{m.title || `ישיבה מ-${formatMeetingDate(m.meeting_date)}`}</bdi>}
                // Without a title the date already names the row, so it is not repeated under it.
                detail={m.title ? formatMeetingDate(m.meeting_date) : undefined}
                to={`/more/meetings/${m.id}`}
              />
            ))}
          </Group>
        ))
      )}
    </>
  );
}

/** The list cut into years, keeping its order (newest first), so each year is one group. */
function byYear(items: MeetingListItem[]): [string, MeetingListItem[]][] {
  const groups: [string, MeetingListItem[]][] = [];
  for (const item of items) {
    const year = item.meeting_date.slice(0, 4);
    const last = groups[groups.length - 1];
    if (last && last[0] === year) last[1].push(item);
    else groups.push([year, [item]]);
  }
  return groups;
}
