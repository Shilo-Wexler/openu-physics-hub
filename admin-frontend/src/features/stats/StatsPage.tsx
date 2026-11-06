/** The stats screen: a period switch; five tiles (site visits, registered users, posts, replies and
    new inquiries); how the inquiries split by type, and the busiest courses in inquiries and in the chat.
    Read-only, every level.
    On a computer: the switch beside the title, the five tiles in one row, and the three lists side by side.
    On a phone: the tiles two in a row (the inquiries tile across the whole row), then the lists. */

import { useSearchParams } from "react-router";

import { getStats, type ChatSummary, type Period, type SiteVisits, type Stats } from "../../shared/api/stats";
import { Group, Row } from "../../shared/components/GroupedList";
import { ListMessage } from "../../shared/components/ListRow";
import SegmentedControl from "../../shared/components/SegmentedControl";
import { courseLabel, TYPE_LABEL } from "../../shared/lib/inquiryLabels";
import { useAdmin, useLoad } from "../../layout/consoleContext";
import LoadError from "../../layout/LoadError";
import styles from "./StatsPage.module.css";

const PERIODS: { value: Period; label: string }[] = [
  { value: "7", label: "7 ימים" },
  { value: "30", label: "30 יום" },
  { value: "all", label: "הכול" },
];

/** What the comparison line says the count is compared with. */
const PREVIOUS_LABEL: Record<Period, string> = {
  "7": "מ-7 הימים שלפני",
  "30": "מ-30 הימים שלפני",
  all: "",
};

const CHAT_DOWN = "הצ'אט לא זמין כרגע.";

/** Big numbers with a thousands separator: 1,234. */
const NUMBER = new Intl.NumberFormat("he-IL");

/** The period is in the URL (?period=30), so it stays when going back to this screen. 7 days by default. */
function readPeriod(raw: string | null): Period {
  return raw === "30" || raw === "all" ? raw : "7";
}

export default function StatsPage() {
  const { token } = useAdmin();
  const [params, setParams] = useSearchParams();
  const period = readPeriod(params.get("period"));
  const stats = useLoad((signal) => getStats(token, period, signal), [token, period]);

  // replace: switching periods should not fill the back button's history.
  function changePeriod(value: Period) {
    setParams(value === "7" ? {} : { period: value }, { replace: true });
  }

  const shown = stats.data;
  // The previous period's numbers stay on screen (dimmed) while the new ones load, so switching doesn't flash.
  const stale = shown !== null && shown.period !== period;

  return (
    <>
      {/* On a computer the switch sits at the far end of the title's row; on a phone under it. */}
      <div className={styles.titleRow}>
        <h1>נתונים</h1>
        <div className={styles.switch}>
          <SegmentedControl label="תקופה" segments={PERIODS} value={period} onChange={changePeriod} />
        </div>
      </div>

      {shown === null ? (
        stats.failed ? (
          <LoadError loaded={stats} what="הנתונים" />
        ) : (
          <ListMessage>טוען…</ListMessage>
        )
      ) : (
        <div className={stale ? styles.stale : undefined} aria-busy={stale}>
          {stats.failed && <p className="error">לא הצלחנו לטעון את הנתונים של התקופה הזו.</p>}
          <StatsBody stats={shown} />
        </div>
      )}
    </>
  );
}

function StatsBody({ stats }: { stats: Stats }) {
  const { inquiries, chat_courses: chatCourses } = stats;
  // Most common type first; the bars are measured against it.
  const types = Object.entries(inquiries.by_type).sort(([, a], [, b]) => b - a) as [keyof typeof TYPE_LABEL, number][];
  const most = Math.max(1, ...types.map(([, n]) => n));

  return (
    <>
      <div className={styles.tiles}>
        <VisitsTile visits={stats.visits} period={stats.period} />
        <ChatTiles chat={stats.chat_summary} period={stats.period} />
        {/* Last, so on a phone it takes the whole row under the four site tiles. */}
        <Tile
          label="פניות חדשות"
          value={NUMBER.format(inquiries.count)}
          note={comparison(inquiries.count, inquiries.previous_count, stats.period)}
        />
      </div>

      <div className={styles.columns}>
        <Group title="פניות לפי סוג">
          {types.map(([type, n]) => (
            <Row
              key={type}
              label={TYPE_LABEL[type]}
              value={n}
              detail={
                <span className={styles.bar} aria-hidden="true">
                  <span className={styles.fill} style={{ width: `${(n / most) * 100}%` }} />
                </span>
              }
            />
          ))}
        </Group>

        <Group title="קורסים עם הכי הרבה פניות">
          {inquiries.top_courses.length === 0 ? (
            <Row label="אין פניות בתקופה הזו." />
          ) : (
            inquiries.top_courses.map((c) => (
              <Row
                key={c.course_number}
                label={courseLabel(c.course_number, c.course_name)}
                value={countLabel(c.inquiry_count, "פנייה", "פניות")}
              />
            ))
          )}
        </Group>

        <Group title="הכי פעילים בצ'אט">
          {chatCourses === null ? (
            <Row label="הצ'אט לא זמין כרגע. אפשר לנסות שוב מאוחר יותר." />
          ) : chatCourses.length === 0 ? (
            <Row label="אין הודעות בתקופה הזו." />
          ) : (
            chatCourses.map((c) => (
              <Row
                key={c.course_id}
                label={courseLabel(c.course_id, c.course_name)}
                value={countLabel(c.message_count, "הודעה", "הודעות")}
              />
            ))
          )}
        </Group>
      </div>
    </>
  );
}

/** Page loads on the public site (from Cloudflare, kept in the admin DB). Without a full previous period
    to compare with (always for "all"), the note says from which day the site is counted. */
function VisitsTile({ visits, period }: { visits: SiteVisits | null; period: Period }) {
  if (visits === null) return <Tile label="כניסות לאתר" value="—" note="עדיין אין נתונים." />;
  const note =
    visits.previous_count === null
      ? `נספר מאז ${shortDate(visits.since)}`
      : comparison(visits.count, visits.previous_count, period);
  return <Tile label="כניסות לאתר" value={NUMBER.format(visits.count)} note={note} />;
}

/** Users, posts and replies, from the chat backend. When it does not answer, only these three say so. */
function ChatTiles({ chat, period }: { chat: ChatSummary | null; period: Period }) {
  if (chat === null) {
    return (
      <>
        <Tile label="משתמשים רשומים" value="—" note={CHAT_DOWN} />
        <Tile label="פוסטים" value="—" note={CHAT_DOWN} />
        <Tile label="תגובות" value="—" note={CHAT_DOWN} />
      </>
    );
  }
  return (
    <>
      <Tile label="משתמשים רשומים" value={NUMBER.format(chat.users_total)} note={usersNote(chat)} />
      <Tile label="פוסטים" value={NUMBER.format(chat.posts)} note={comparison(chat.posts, chat.posts_previous, period)} />
      <Tile
        label="תגובות"
        value={NUMBER.format(chat.replies)}
        note={comparison(chat.replies, chat.replies_previous, period)}
      />
    </>
  );
}

/** A white card with a grey label, a big number and a note. */
function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <section className={styles.tile}>
      <h2 className={styles.tileLabel}>{label}</h2>
      <p className={styles.tileNumber} title={value}>
        {value}
      </p>
      <p className={styles.tileNote}>{note}</p>
    </section>
  );
}

/** "4 יותר מ-7 הימים שלפני", or a plain note for "all", which has nothing to compare with. */
function comparison(count: number, previous: number | null, period: Period): string {
  if (previous === null) return "מאז שהאתר עלה";
  const diff = count - previous;
  if (diff === 0) return `כמו ב-${period === "7" ? "7 הימים" : "30 הימים"} שלפני`;
  return `${diff > 0 ? "▲" : "▼"} ${NUMBER.format(Math.abs(diff))} ${diff > 0 ? "יותר" : "פחות"} ${PREVIOUS_LABEL[period]}`;
}

/** "3 חדשים בתקופה · אחד ממתין למחיקה". The total is today's, so "all" only says so. */
function usersNote(chat: ChatSummary): string {
  const n = chat.users_new;
  const added = n === null ? "סך הכול" : n === 1 ? "משתמש חדש אחד בתקופה" : `${NUMBER.format(n)} חדשים בתקופה`;
  const pending = chat.deletion_pending;
  if (pending === 0) return added;
  return `${added} · ${pending === 1 ? "אחד ממתין" : `${pending} ממתינים`} למחיקה`;
}

/** "2026-10-08" as "8.10". */
function shortDate(day: string): string {
  const [, month, date] = day.split("-");
  return `${Number(date)}.${Number(month)}`;
}

/** Hebrew singular for one, plural otherwise: "פנייה אחת", "3 פניות". */
function countLabel(n: number, one: string, many: string): string {
  return n === 1 ? `${one} אחת` : `${n} ${many}`;
}
