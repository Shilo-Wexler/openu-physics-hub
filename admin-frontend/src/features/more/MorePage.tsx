/** The "more" screen: everything that does not fit the bottom bar, plus the signed-in account. */

import { Link } from "react-router";
import { Group, Row } from "../../shared/components/GroupedList";
import { LEVEL_LABEL } from "../../shared/lib/levels";
import { useIsDesktop } from "../../shared/lib/useIsDesktop";
import { useAdmin } from "../../layout/consoleContext";
import styles from "./MorePage.module.css";

/** The coloured square behind a row's icon, like iOS Settings. */
function IconTile({ paths, large = false }: { paths: string[]; large?: boolean }) {
  return (
    <span className={large ? `${styles.tile} ${styles.tileLarge}` : styles.tile}>
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

/** The screens under "more". New sections are added here, and show on both layouts. */
const SECTIONS = [
  {
    to: "/more/admins",
    label: "צוות",
    hint: "ניהול חברי הצוות והתפקידים שלהם",
    icon: USERS_ICON,
  },
  {
    to: "/more/meetings",
    label: "סיכומי ישיבות",
    hint: "סיכומים של ישיבות קודמות ופתיחת סיכום חדש",
    icon: NOTES_ICON,
  },
];

function Chevron() {
  return (
    <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

interface Props {
  onSignOut: () => void;
}

export default function MorePage({ onSignOut }: Props) {
  const desktop = useIsDesktop();
  return (
    <>
      <h1>עוד</h1>
      {desktop ? <DesktopMore onSignOut={onSignOut} /> : <PhoneMore onSignOut={onSignOut} />}
    </>
  );
}

/** Phone: grouped rows, one under the other. */
function PhoneMore({ onSignOut }: Props) {
  const { email, role, nameOf } = useAdmin();

  return (
    <>
      <Group>
        {SECTIONS.map((s) => (
          <Row key={s.to} icon={<IconTile paths={s.icon} />} label={s.label} to={s.to} />
        ))}
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

/** Computer: the account card on the right, a card per section on the left, both the same height. */
function DesktopMore({ onSignOut }: Props) {
  const { email, role, nameOf } = useAdmin();
  const name = nameOf(email) ?? email;
  // The first letter of the name (Array.from keeps a letter made of two code units whole).
  const initial = Array.from(name)[0]?.toUpperCase() ?? "";

  return (
    <div className={styles.layout}>
      <aside className={styles.account} aria-label="החשבון שלך">
        <span className={styles.avatar} aria-hidden="true">
          {initial}
        </span>
        <bdi className={styles.name}>{name}</bdi>
        <bdi className={styles.email} dir="ltr">
          {email}
        </bdi>
        <span className={styles.level}>{LEVEL_LABEL[role]}</span>

        <div className={styles.accountLinks}>
          <Link className={styles.accountRow} to={`/more/admins/${encodeURIComponent(email)}`}>
            <span>עריכת השם שלך</span>
            <Chevron />
          </Link>
          <button type="button" className={`${styles.accountRow} ${styles.danger}`} onClick={onSignOut}>
            התנתקות
          </button>
        </div>
      </aside>

      <nav className={styles.cards} aria-label="מסכים נוספים">
        {SECTIONS.map((s) => (
          <Link key={s.to} className={styles.card} to={s.to}>
            <IconTile paths={s.icon} large />
            <span className={styles.cardText}>
              <span className={styles.cardTitle}>{s.label}</span>
              <span className={styles.cardHint}>{s.hint}</span>
            </span>
            <Chevron />
          </Link>
        ))}
      </nav>
    </div>
  );
}
