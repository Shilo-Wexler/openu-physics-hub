/** The stats screen: a period switch, the inquiries received in it compared with the period before,
    how they split by type, and the busiest courses in inquiries and in the chat. Read-only, every level. */

import { useSearchParams } from "react-router";

import { getStats, type Period, type Stats } from "../../shared/api/stats";
import { Group, Row } from "../../shared/components/GroupedList";
import { ListMessage } from "../../shared/components/ListRow";
import SegmentedControl from "../../shared/components/SegmentedControl";
import { courseLabel, TYPE_LABEL } from "../../shared/lib/inquiryLabels";
import { useAdmin, useLoad } from "../../layout/consoleContext";
import styles from "./StatsPage.module.css";

const PERIODS: { value: Period; label: string }[] = [
  { value: "7", label: "7 ימים" },
  { value: "30", label: "30 יום" },
  { value: "all", label: "הכל" },
];

/** What the comparison line says the count is compared with. */
const PREVIOUS_LABEL: Record<Period, string> = {
  "7": "מ-7 הימים שלפני",
  "30": "מ-30 הימים שלפני",
  all: "",
};

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
      <h1>נתונים</h1>

      <div className={styles.switch}>
        <SegmentedControl label="תקופה" segments={PERIODS} value={period} onChange={changePeriod} />
      </div>

      {shown === null ? (
        stats.failed ? (
          <p className="error">לא הצלחנו לטעון את הנתונים. נסו לרענן את הדף.</p>
        ) : (
          <ListMessage>טוען...</ListMessage>
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
      <section className={styles.tile}>
        <h2 className={styles.tileLabel}>פניות חדשות</h2>
        <p className={styles.tileNumber}>{inquiries.count}</p>
        <p className={styles.tileNote}>{comparison(inquiries.count, inquiries.previous_count, stats.period)}</p>
      </section>

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
          <Row label="הצ'אט לא זמין כרגע, נסו שוב מאוחר יותר." />
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
    </>
  );
}

/** "4 יותר מ-7 הימים שלפני", or a plain note for "all", which has nothing to compare with. */
function comparison(count: number, previous: number | null, period: Period): string {
  if (previous === null) return "מאז שהאתר עלה";
  const diff = count - previous;
  if (diff === 0) return `כמו ב-${period === "7" ? "7 הימים" : "30 הימים"} שלפני`;
  return `${diff > 0 ? "▲" : "▼"} ${Math.abs(diff)} ${diff > 0 ? "יותר" : "פחות"} ${PREVIOUS_LABEL[period]}`;
}

/** Hebrew singular for one, plural otherwise: "פנייה אחת", "3 פניות". */
function countLabel(n: number, one: string, many: string): string {
  return n === 1 ? `${one} אחת` : `${n} ${many}`;
}