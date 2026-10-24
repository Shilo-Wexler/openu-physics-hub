import { Group, Row } from "../../components/GroupedList";
import { LEVEL_LABEL } from "../../lib/levels";
import { useAdmin } from "../admin/context";

/** The coloured square behind a row's icon, like iOS Settings. */
function IconTile({ paths, color }: { paths: string[]; color: string }) {
  return (
    <span
      style={{
        width: 30,
        height: 30,
        borderRadius: 7,
        background: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
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

interface Props {
  onSignOut: () => void;
}

/** Everything that does not fit the bottom bar, plus the signed-in account. New sections become rows here. */
export default function MorePage({ onSignOut }: Props) {
  const { email, role } = useAdmin();

  return (
    <>
      <h1>עוד</h1>

      <Group>
        <Row icon={<IconTile paths={USERS_ICON} color="var(--color-primary)" />} label="מנהלים" to="/more/admins" />
      </Group>

      <Group title="החשבון שלך">
        <Row label="מייל" value={<bdi dir="ltr">{email}</bdi>} />
        <Row label="תפקיד" value={LEVEL_LABEL[role]} />
      </Group>

      <Group>
        <Row label="התנתקות" danger onClick={onSignOut} />
      </Group>
    </>
  );
}
