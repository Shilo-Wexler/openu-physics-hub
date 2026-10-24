/** The admins, grouped by level: super admins, admins, committee members. A row opens the admin's screen;
    the round "+" (for those who may add admins) starts a new one. Every level sees the list. */

import { Link } from "react-router";

import { listAdmins, type AdminRow } from "../../api/admins";
import { ListMessage, ListRow, RowList } from "../../components/ListRow";
import { LEVELS, levelsManagedBy, type Level } from "../../lib/levels";
import { useAdmin, useLoad } from "./context";
import LoadError from "./LoadError";
import styles from "./AdminsListPage.module.css";

const GROUP_TITLE: Record<Level, string> = {
  super_admin: "מנהלים ראשיים",
  admin: "מנהלים",
  member: "חברי ועדה",
};

export default function AdminsListPage() {
  const { token, email: me, role, version } = useAdmin();
  const admins = useLoad((signal) => listAdmins(token, signal), [token, version]);
  const canAdd = levelsManagedBy(role).length > 0;
  const rows = admins.data;

  return (
    <>
      <header className={styles.head}>
        <h1>מנהלים</h1>
        {canAdd && (
          <Link to="/more/admins/new" className={styles.add} aria-label="מנהל חדש">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
        )}
      </header>

      {admins.failed ? (
        <LoadError loaded={admins} what="רשימת המנהלים" />
      ) : !rows ? (
        <ListMessage>טוען...</ListMessage>
      ) : (
        LEVELS.map((level) => (
          <AdminGroup key={level} title={GROUP_TITLE[level]} me={me} admins={rows.filter((a) => a.role === level)} />
        ))
      )}
    </>
  );
}

function AdminGroup({ title, me, admins }: { title: string; me: string; admins: AdminRow[] }) {
  if (admins.length === 0) return null;
  return (
    <section className={styles.group}>
      <h2 className={styles.groupTitle}>{title}</h2>
      <RowList>
        {admins.map((a) => (
          <ListRow
            key={a.email}
            to={`/more/admins/${encodeURIComponent(a.email)}`}
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
