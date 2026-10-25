/** One blocked user: when they were blocked, the messages moderators removed, and unblocking. */

import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { isAuthError } from "../../shared/api/client";
import { blockedUsers, removedMessages, unblockUser } from "../../shared/api/chat";
import BackLink from "../../shared/components/BackLink";
import { useConfirm } from "../../shared/components/ConfirmSheet";
import { Group, Row } from "../../shared/components/GroupedList";
import { formatDateTime } from "../../shared/lib/format";
import { actionError, useAdmin, useLoad } from "../../layout/consoleContext";
import LoadError from "../../layout/LoadError";
import styles from "./ReportPage.module.css";

const BACK = "/chat?view=blocked";

export default function BlockedUserPage() {
  const { token, version, changed, onAuthError } = useAdmin();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const userId = useParams().userId ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // As with reports: no "one user" route, and the blocked list is short.
  const users = useLoad((signal) => blockedUsers(token, signal), [token, version]);
  const removed = useLoad((signal) => removedMessages(token, userId, signal), [token, userId]);
  const user = users.data?.find((u) => u.user_id === userId);

  async function unblock() {
    if (busy || !user) return;
    const ok = await confirm({
      message: `החשבון של ${user.nickname} יוכל שוב לכתוב, לדרג ולדווח.`,
      action: "ביטול החסימה",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await unblockUser(token, userId);
      changed();
      navigate(BACK, { replace: true });
    } catch (e) {
      if (isAuthError(e)) onAuthError();
      else setError(actionError(e));
      setBusy(false);
    }
  }

  const back = <BackLink to={BACK} label="חסומים" />;

  if (users.failed) {
    return (
      <>
        {back}
        <LoadError loaded={users} what="המשתמש" />
      </>
    );
  }
  if (!users.data) {
    return (
      <>
        {back}
        <p className={styles.status}>טוען...</p>
      </>
    );
  }
  if (!user) {
    return (
      <>
        {back}
        <p className={styles.status}>המשתמש הזה כבר לא חסום.</p>
      </>
    );
  }

  return (
    <>
      {back}

      <header className={styles.head}>
        <h1 className={styles.title}>
          <bdi>{user.nickname}</bdi>
        </h1>
        <p className={styles.meta}>נחסם {formatDateTime(user.blocked_at)}</p>
      </header>

      {error && <p className="error">{error}</p>}

      <Group footer="אחרי ביטול החסימה החשבון יוכל שוב לכתוב, לדרג ולדווח.">
        <Row label="ביטול החסימה" onClick={() => void unblock()} />
      </Group>

      <h2 className={styles.sectionTitle}>הודעות שהוסרו</h2>
      {removed.failed && <LoadError loaded={removed} what="ההודעות שהוסרו" />}
      {removed.data && removed.data.length === 0 && <p className={styles.status}>לא הוסרו הודעות של החשבון הזה.</p>}
      {removed.data?.map((m) => (
        <article key={m.message_id} className={styles.removed}>
          <p className={styles.meta}>
            {m.course_name} · הוסרה {formatDateTime(m.removed_at)}
          </p>
          <div className={styles.content} dir="auto">
            {m.content}
          </div>
        </article>
      ))}
    </>
  );
}
