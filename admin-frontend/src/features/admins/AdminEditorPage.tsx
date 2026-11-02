/** One admin as a form, new or existing: name and level, one "save", and removing them.
    What a level may not change is shown without the controls (lib/levels); the server checks again.
    On a phone "save" returns to the list; on a computer, where the list stays beside it, the person stays
    open as saved. On a wide screen the form has two columns: name and level, and beside them save,
    the details and removing. */

import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";

import { addAdmin, listAdmins, removeAdmin, setAdminName, setAdminRole, type AdminRow } from "../../shared/api/admins";
import { isAbort, isAuthError } from "../../shared/api/client";
import BackLink from "../../shared/components/BackLink";
import { useConfirm } from "../../shared/components/ConfirmSheet";
import { Group, Row } from "../../shared/components/GroupedList";
import { useReportUnsaved, useSplit } from "../../shared/components/SplitView";
import { formatDateTime } from "../../shared/lib/format";
import { LEVEL_HINT, LEVEL_LABEL, levelsManagedBy, type Level } from "../../shared/lib/levels";
import { emailError } from "../../shared/lib/validation";
import { errorMessage } from "../../shared/lib/errors";
import { charLength } from "../../shared/lib/text";
import { LEAVE_QUESTION, useWarnOnLeave } from "../../shared/lib/unsaved";
import AdminLabel from "../../layout/AdminLabel";
import { useAdmin } from "../../layout/consoleContext";
import styles from "./AdminEditorPage.module.css";

// The server's limits (004_admin_roles.sql, schemas.py), checked here first.
const MIN_NAME = 2;
const MAX_NAME = 40;

const BACK = "/more/admins";

export default function AdminEditorPage() {
  const { email } = useParams();
  // /more/admins/new has no email. key: opening another admin starts from fresh state.
  if (email === undefined) return <AdminEditor key="new" email={null} />;
  return <AdminEditor key={email} email={email.toLowerCase()} />;
}

function AdminEditor({ email }: { email: string | null }) {
  const { token, email: me, role: myRole, changed, onAuthError } = useAdmin();
  const { split } = useSplit();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const managed = levelsManagedBy(myRole);

  const [saved, setSaved] = useState<AdminRow | null>(null);
  const [missing, setMissing] = useState(false);
  // The form, sent together by "save".
  const [newEmail, setNewEmail] = useState("");
  const [name, setName] = useState("");
  const [level, setLevel] = useState<Level>("team");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // There is no "one admin" route; the list is short, so it is read whole.
  useEffect(() => {
    if (email === null) return;
    const controller = new AbortController();
    listAdmins(token, controller.signal)
      .then((admins) => {
        const found = admins.find((a) => a.email === email);
        if (!found) {
          setMissing(true);
          return;
        }
        setSaved(found);
        setName(found.name);
        setLevel(found.role);
      })
      .catch((e: unknown) => {
        if (isAbort(e)) return;
        if (isAuthError(e)) onAuthError();
        else setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [email, token, onAuthError]);

  const isNew = email === null;
  const isSelf = saved !== null && saved.email === me;
  // Changing their level or removing them: never yourself, and only levels this admin manages.
  const canManage = isNew || (saved !== null && !isSelf && managed.includes(saved.role));
  const canRename = isSelf || canManage;

  const nameChanged = name.trim() !== (saved?.name ?? "");
  const levelChanged = !isNew && saved !== null && level !== saved.role;
  const dirty = isNew ? newEmail.trim() !== "" || name.trim() !== "" : nameChanged || levelChanged;

  // Closing or reloading the tab with unsaved changes asks too (the browser's own question),
  // and on a computer so does a click in the list beside the form.
  useWarnOnLeave(dirty);
  useReportUnsaved(dirty);

  // Nobody to add for team, so the "new" screen goes back to the list.
  if (isNew && managed.length === 0) return <Navigate to={BACK} replace />;

  /** What is wrong with the form, or null when it can be sent. */
  function problem(): string | null {
    if (isNew) {
      const wrong = emailError(newEmail);
      if (wrong) return wrong;
    }
    const nameLength = charLength(name);
    if (nameLength < MIN_NAME || nameLength > MAX_NAME) return `השם צריך להיות בין ${MIN_NAME} ל-${MAX_NAME} תווים.`;
    return null;
  }

  /** Sends what changed (the name, then the level). Then back to the list on a phone; on a computer the
      person stays open as saved, and someone new opens at their own address. */
  async function save() {
    const wrong = problem();
    if (wrong) {
      setError(wrong);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const added = newEmail.trim().toLowerCase();
        await addAdmin(token, added, name.trim(), level);
        changed();
        navigate(split ? `${BACK}/${encodeURIComponent(added)}` : BACK, { replace: true });
        return;
      }
      if (saved) {
        let current = saved;
        if (nameChanged) {
          current = await setAdminName(token, saved.email, name.trim());
          setSaved(current);
        }
        if (levelChanged) {
          await setAdminRole(token, saved.email, level);
          current = { ...current, role: level };
        }
        changed();
        if (!split) {
          navigate(BACK, { replace: true });
          return;
        }
        setSaved(current);
        setName(current.name);
        setLevel(current.role);
        setSaving(false);
      }
    } catch (e) {
      // A name saved before the level failed stays saved: the form now starts from it.
      changed();
      if (isAuthError(e)) onAuthError();
      else setError(errorMessage(e));
      setSaving(false);
    }
  }

  async function remove() {
    if (!saved) return;
    const ok = await confirm({
      message: `${saved.name} יאבד מיד את הגישה לקונסולה.`,
      action: "הסרה מהצוות",
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      await removeAdmin(token, saved.email);
      changed();
      // On a computer the list then opens its first person beside it.
      navigate(BACK, { replace: true });
    } catch (e) {
      if (isAuthError(e)) onAuthError();
      else setError(errorMessage(e));
      setSaving(false);
    }
  }

  // On a computer the list is beside the form, so there is nothing to go back to.
  const back = split ? null : <BackLink to={BACK} label="צוות" confirm={dirty ? LEAVE_QUESTION : undefined} />;

  if (missing) {
    return (
      <>
        {back}
        <p className={styles.status}>חבר הצוות הזה כבר לא ברשימה. אולי הוא הוסר.</p>
      </>
    );
  }
  if (!isNew && !saved) {
    return (
      <>
        {back}
        {error ? <p className="error">{error}</p> : <p className={styles.status}>טוען…</p>}
      </>
    );
  }

  const check = <span className={styles.check}>✓</span>;
  // Why the level can't be changed here, under the level.
  const levelNote = isSelf
    ? "את התפקיד שלך יכול לשנות רק מישהו אחר."
    : !canManage
      ? myRole === "team"
        ? "רק חבר ועד או מנהל יכולים לשנות תפקידים."
        : "רק מנהל יכול לשנות מנהל."
      : LEVEL_HINT[level];

  return (
    <div className={styles.form}>
      {back}
      <h1 className={styles.heading}>{isNew ? "חבר צוות חדש" : saved?.name}</h1>

      {/* Two columns on a wide screen; on a phone one under the other, in the same order. */}
      <div className={styles.layout}>
        {/* Who they are and what they may do. */}
        <div>
          {isNew && (
            <section className={styles.section}>
              <label htmlFor="admin-email" className={styles.label}>
                מייל
              </label>
              <input
                id="admin-email"
                className={styles.field}
                type="email"
                dir="ltr"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                autoComplete="off"
              />
              <p className={styles.hint}>חשבון הגוגל שאיתו חבר הצוות ייכנס, למשל name@gmail.com. הגישה נפתחת מיד.</p>
            </section>
          )}

          <section className={styles.section}>
            <label htmlFor="admin-name" className={styles.label}>
              שם
            </label>
            <input
              id="admin-name"
              className={styles.field}
              value={name}
              onChange={(e) => setName(e.target.value)}
              readOnly={!canRename}
              maxLength={MAX_NAME}
              dir="auto"
            />
            <p className={styles.hint}>השם שיופיע בקונסולה.</p>
          </section>

          {canManage ? (
            <Group title="תפקיד" footer={levelNote}>
              {managed.map((option) => (
                <Row
                  key={option}
                  label={LEVEL_LABEL[option]}
                  value={option === level ? check : undefined}
                  onClick={() => setLevel(option)}
                  choice
                />
              ))}
            </Group>
          ) : (
            <Group title="תפקיד" footer={levelNote}>
              <Row label={LEVEL_LABEL[level]} />
            </Group>
          )}
        </div>

        {/* Save, the details and removing. On a wide screen it stays in sight beside the form. */}
        <div className={styles.side}>
          {error && <p className="error">{error}</p>}
          {canRename && (
            <button type="button" className={styles.save} disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? "שומר…" : isNew ? "הוספה" : "שמירה"}
            </button>
          )}

          {saved && (
            <>
              <Group title="פרטים">
                <Row label="מייל" value={<bdi dir="ltr">{saved.email}</bdi>} />
                <Row
                  label="נוסף על ידי"
                  value={saved.added_by ? <AdminLabel email={saved.added_by} /> : "ישירות ב-DB"}
                />
                <Row label="נוסף" value={formatDateTime(saved.created_at)} />
              </Group>
              {canManage && (
                <Group>
                  <Row label="הסרה מהצוות" danger onClick={() => void remove()} />
                </Group>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
