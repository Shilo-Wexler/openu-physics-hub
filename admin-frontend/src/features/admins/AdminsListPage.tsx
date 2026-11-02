/** The team, grouped by level: admins, committee members, team. A row opens the person's screen;
    the round "+" (for those who may add someone) starts a new one. Every level sees the list.
    On a computer the person's screen opens beside the list (see SplitView), the first one by itself. */

import type { MouseEvent } from "react";
import { Link, useMatch, useNavigate } from "react-router";

import { listAdmins, type AdminRow } from "../../shared/api/admins";
import { ListMessage, ListRow, RowList } from "../../shared/components/ListRow";
import { positionText, useAutoOpen, useReportPosition, useSplit } from "../../shared/components/SplitView";
import { LEVELS, levelsManagedBy, type Level } from "../../shared/lib/levels";
import { useAdmin, useLoad } from "../../layout/consoleContext";
import LoadError from "../../layout/LoadError";
import styles from "./AdminsListPage.module.css";

const GROUP_TITLE: Record<Level, string> = {
  admin: "מנהלים",
  committee: "חברי ועד",
  team: "צוות",
};

const BASE = "/more/admins";
const NEW_PATH = `${BASE}/new`;

function personPath(email: string): string {
  return `${BASE}/${encodeURIComponent(email)}`;
}

/** The round "+" that adds someone, only for those who may (team may not). On a computer it sits beside
    the title (SplitView draws it there) while a form may be open beside the list: unsaved changes ask first. */
export function NewAdminLink() {
  const { role } = useAdmin();
  const { isDirty, confirmLeave } = useSplit();
  const navigate = useNavigate();
  if (levelsManagedBy(role).length === 0) return null;

  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (!isDirty()) return;
    event.preventDefault();
    void confirmLeave().then((ok) => {
      if (ok) navigate(NEW_PATH);
    });
  }

  return (
    <Link to={NEW_PATH} className={styles.add} aria-label="חבר צוות חדש" onClick={open}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </Link>
  );
}

export default function AdminsListPage() {
  const { token, email: me, version } = useAdmin();
  const { split } = useSplit();
  const admins = useLoad((signal) => listAdmins(token, signal), [token, version]);
  const rows = admins.data;
  // In the order shown: by level, then as the server sends them.
  const ordered = rows ? LEVELS.flatMap((level) => rows.filter((a) => a.role === level)) : [];

  // On a computer with nobody open, the first person opens beside the list.
  const first = ordered[0];
  useAutoOpen(first ? personPath(first.email) : null, admins.loading, version);

  // Where the open person sits in the list, shown above their screen on a computer: "חבר צוות 2 מתוך 5".
  const openEmail = useMatch(`${BASE}/:email`)?.params.email?.toLowerCase();
  const index = ordered.findIndex((a) => a.email === openEmail);
  useReportPosition(positionText("חבר צוות", index, rows?.length));

  return (
    <>
      {/* On a computer the title and the "+" sit above the list-and-form window (SplitView draws them). */}
      {!split && (
        <header className={styles.head}>
          <h1>צוות</h1>
          <NewAdminLink />
        </header>
      )}

      {admins.failed ? (
        <LoadError loaded={admins} what="רשימת הצוות" />
      ) : !rows ? (
        <ListMessage>טוען…</ListMessage>
      ) : (
        LEVELS.map((level) => (
          <AdminGroup key={level} title={GROUP_TITLE[level]} me={me} admins={rows.filter((a) => a.role === level)} />
        ))
      )}
    </>
  );
}

/** The first letter of a name, for the round mark before it. */
function initial(name: string): string {
  return [...name.trim()][0] ?? "?";
}

/** A level's title bar with how many it holds (on a computer it stays at the top while its rows scroll),
    then a row for each person: the first letter of the name in a circle, the name, the email. */
function AdminGroup({ title, me, admins }: { title: string; me: string; admins: AdminRow[] }) {
  if (admins.length === 0) return null;
  return (
    <section className={styles.group}>
      <h2 className={styles.groupTitle}>
        {title}
        <span className={styles.groupCount}>{admins.length}</span>
      </h2>
      <RowList>
        {admins.map((a) => (
          <ListRow
            key={a.email}
            to={personPath(a.email)}
            leading={
              <span className={styles.avatar} aria-hidden="true">
                {initial(a.name)}
              </span>
            }
            title={
              <>
                <bdi>{a.name}</bdi>
                {a.email === me && <span className={styles.me}> (את/ה)</span>}
              </>
            }
            subtitle={<bdi dir="ltr">{a.email}</bdi>}
          />
        ))}
      </RowList>
    </section>
  );
}
