/** The "more" screen: everything that does not fit the bottom bar, plus the signed-in account. */

import { Group, Row } from "../../shared/components/GroupedList";
import { LEVEL_LABEL } from "../../shared/lib/levels";
import { useAdmin } from "../../layout/consoleContext";
import styles from "./MorePage.module.css";

/** The coloured square behind a row's icon, like iOS Settings. */
function IconTile({ paths }: { paths: string[] }) {
  return (
    <span className={styles.tile}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </span>
  );
}

const USERS_ICON = [
  "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
  "M5 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0",
  "M22 21v-2a4 4 0 0 0-3-3.87",
  "M16 3.13a4 4 0 0 1 0 7.75",
];

// A page with lines of text: the meeting summaries.
const NOTES_ICON = [
  "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",
  "M14 2v4a2 2 0 0 0 2 2h4",
  "M16 13H8",
  "M16 17H8",
  "M10 9H8",
];

interface Props {
  onSignOut: () => void;
}

/** New sections become rows here. */
export default function MorePage({ onSignOut }: Props) {
  const { email, role, nameOf } = useAdmin();

  return (
    <>
      <h1>עוד</h1>

      <Group>
        <Row icon={<IconTile paths={USERS_ICON} />} label="מנהלים" to="/more/admins" />
        <Row icon={<IconTile paths={NOTES_ICON} />} label="סיכומי ישיבות" to="/more/meetings" />
      </Group>

      {/* Opens your own admin screen, where you change your name. */}
      <Group title="החשבון שלך">
        <Row
          label={<bdi>{nameOf(email) ?? email}</bdi>}
          detail={<bdi dir="ltr">{email}</bdi>}
          value={LEVEL_LABEL[role]}
          to={`/more/admins/${encodeURIComponent(email)}`}
        />
      </Group>

      <Group>
        <Row label="התנתקות" danger onClick={onSignOut} />
      </Group>
    </>
  );
}
