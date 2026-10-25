/** One reported message: its text, who wrote it and their history, and what to do with it. */

import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { isAuthError } from "../../shared/api/client";
import { blockUser, dismissReports, removeMessage, reportedMessages, unblockUser } from "../../shared/api/chat";
import BackLink from "../../shared/components/BackLink";
import { useConfirm } from "../../shared/components/ConfirmSheet";
import { Group, Row } from "../../shared/components/GroupedList";
import { formatDateTime } from "../../shared/lib/format";
import { actionError, useAdmin, useLoad } from "../../layout/consoleContext";
import LoadError from "../../layout/LoadError";
import styles from "./ReportPage.module.css";

export default function ReportPage() {
  const { token, version, changed, onAuthError } = useAdmin();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const id = Number(useParams().id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // There is no "one report" route; the open reports are few, so the list is loaded and searched.
  const reported = useLoad((signal) => reportedMessages(token, signal), [token, version]);
  const message = reported.data?.find((m) => m.message_id === id);

  /** Runs one action. `leave`: the report is handled, so back to the list; otherwise stay (block, unblock). */
  async function run(action: () => Promise<unknown>, leave: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      changed();
      if (leave) navigate("/chat", { replace: true });
    } catch (e) {
      if (isAuthError(e)) onAuthError();
      else setError(actionError(e));
    } finally {
      setBusy(false);
    }
  }

  const back = <BackLink to="/chat" label="צ'אט" />;

  if (reported.failed) {
    return (
      <>
        {back}
        <LoadError loaded={reported} what="הדיווח" />
      </>
    );
  }
  if (!reported.data) {
    return (
      <>
        {back}
        <p className={styles.status}>טוען...</p>
      </>
    );
  }
  // Handled meanwhile (here or by another admin), or a wrong address.
  if (!message) {
    return (
      <>
        {back}
        <p className={styles.status}>הדיווח הזה כבר טופל.</p>
      </>
    );
  }

  const m = message;

  async function remove() {
    const ok = await confirm({
      message: "ההודעה תוסר מהצ'אט, והדיווחים עליה ייסגרו.",
      action: "הסרת ההודעה",
      danger: true,
    });
    if (ok) await run(() => removeMessage(token, m.message_id), true);
  }

  async function block() {
    const ok = await confirm({
      message: `החשבון של ${m.author_nickname} יוכל לקרוא, אבל לא לכתוב, לדרג או לדווח.`,
      action: "חסימת הכותב",
      danger: true,
    });
    if (ok) await run(() => blockUser(token, m.author_id), false);
  }

  async function unblock() {
    const ok = await confirm({
      message: `החשבון של ${m.author_nickname} יוכל שוב לכתוב, לדרג ולדווח.`,
      action: "ביטול החסימה",
    });
    if (ok) await run(() => unblockUser(token, m.author_id), false);
  }

  return (
    <>
      {back}

      <header className={styles.head}>
        <h1 className={styles.title}>
          <bdi>{m.author_nickname}</bdi>
        </h1>
        <p className={styles.meta}>
          <span className={styles.count}>{m.report_count === 1 ? "דיווח אחד" : `${m.report_count} דיווחים`}</span>
          <span>
            {m.course_name} · {formatDateTime(m.created_at)}
          </span>
        </p>
      </header>

      <div className={styles.content} dir="auto">
        {m.content}
      </div>

      {error && <p className="error">{error}</p>}

      <Group footer="התעלמות: הדיווחים נסגרים וההודעה נשארת בצ'אט.">
        <Row label="להתעלם מהדיווח" onClick={() => run(() => dismissReports(token, m.message_id), true)} />
        <Row label="להסיר את ההודעה" danger onClick={() => void remove()} />
      </Group>

      <Group title="הכותב">
        <Row label="הודעות שדווחו" value={m.author_reported_count} />
        <Row label="הודעות שהוסרו" value={m.author_removed_count} />
        {m.author_blocked ? (
          <Row label="ביטול החסימה" onClick={() => void unblock()} />
        ) : (
          <Row label="לחסום את הכותב" danger onClick={() => void block()} />
        )}
      </Group>
    </>
  );
}
