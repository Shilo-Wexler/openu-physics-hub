/** One admin as a form, new or existing: name and level, one "save", and removing them.
    What a level may not change is shown without the controls (lib/levels); the server checks again. */

import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";

import { addAdmin, listAdmins, removeAdmin, setAdminName, setAdminRole, type AdminRow } from "../../shared/api/admins";
import { isAbort, isAuthError } from "../../shared/api/client";
import BackLink from "../../shared/components/BackLink";
import { useConfirm } from "../../shared/components/ConfirmSheet";
import { Group, Row } from "../../shared/components/GroupedList";
import { formatDateTime } from "../../shared/lib/format";
import { LEVEL_HINT, LEVEL_LABEL, levelsManagedBy, type Level } from "../../shared/lib/levels";
import { emailError } from "../../shared/lib/validation";
import AdminLabel from "../../layout/AdminLabel";
import { actionError, useAdmin } from "../../layout/consoleContext";
import styles from "./AdminEditorPage.module.css";

// The server's limits (004_admin_roles.sql, schemas.py), checked here first.
const MIN_NAME = 2;
const MAX_NAME = 40;

const BACK = "/more/admins";
const LEAVE_QUESTION = "יש שינויים שלא נשמרו. לצאת בלי לשמור?";

/** Length the way the server counts it: characters, not UTF-16 units. */
function length(text: string): number {
  return [...text.trim()].length;
}

export default function AdminEditorPage() {
  const { email } = useParams();
  // /more/admins/new has no email. key: opening another admin starts from fresh state.
  if (email === undefined) return <AdminEditor key="new" email={null} />;
  return <AdminEditor key={email} email={email.toLowerCase()} />;
}

function AdminEditor({ email }: { email: string | null }) {
  const { token, email: me, role: myRole, changed, onAuthError } = useAdmin();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const managed = levelsManagedBy(myRole);

  const [saved, setSaved] = useState<AdminRow | null>(null);
  const [missing, setMissing] = useState(false);
  // The form, sent together by "save".
  const [newEmail, setNewEmail] = useState("");
  const [name, setName] = useState("");
  const [level, setLevel] = useState<Level>("member");
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
        else setError(actionError(e));
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

  // Closing or reloading the tab with unsaved changes asks too (the browser's own question).
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Nobody to add for a member, so the "new" screen goes back to the list.
  if (isNew && managed.length === 0) return <Navigate to={BACK} replace />;

  /** What is wrong with the form, or null when it can be sent. */
  function problem(): string | null {
    if (isNew) {
      const wrong = emailError(newEmail);
      if (wrong) return wrong;
    }
    if (length(name) < MIN_NAME || length(name) > MAX_NAME) return `השם צריך להיות בין ${MIN_NAME} ל-${MAX_NAME} תווים.`;
    return null;
  }

  /** Sends what changed (the name, then the level), then back to the list. */
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
        await addAdmin(token, newEmail.trim().toLowerCase(), name.trim(), level);
      } else if (saved) {
        if (nameChanged) setSaved(await setAdminName(token, saved.email, name.trim()));
        if (levelChanged) await setAdminRole(token, saved.email, level);
      }
      changed();
      navigate(BACK, { replace: true });
    } catch (e) {
      // A name saved before the level failed stays saved: the form now starts from it.
      changed();
      if (isAuthError(e)) onAuthError();
      else setError(actionError(e));
      setSaving(false);
    }
  }

  async function remove() {
    if (!saved) return;
    const ok = await confirm({
      message: `${saved.name} יאבד מיד את הגישה לקונסולה.`,
      action: "הסרת המנהל",
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      await removeAdmin(token, saved.email);
      changed();
      navigate(BACK, { replace: true });
    } catch (e) {
      if (isAuthError(e)) onAuthError();
      else setError(actionError(e));
      setSaving(false);
    }
  }

  const back = <BackLink to={BACK} label="מנהלים" confirm={dirty ? LEAVE_QUESTION : undefined} />;

  if (missing) {
    return (
      <>
        {back}
        <p className={styles.status}>המנהל הזה כבר לא ברשימה. אולי הוא הוסר.</p>
      </>
    );
  }
  if (!isNew && !saved) {
    return (
      <>
        {back}
        {error ? <p className="error">{error}</p> : <p className={styles.status}>טוען...</p>}
      </>
    );
  }

  const check = <span className={styles.check}>✓</span>;
  // Why the level can't be changed here, under the level.
  const levelNote = isSelf
    ? "את התפקיד שלך יכול לשנות רק מנהל אחר."
    : !canManage
      ? myRole === "member"
        ? "רק מנהל יכול לשנות תפקידים."
        : "רק מנהל ראשי יכול לשנות מנהל ראשי."
      : LEVEL_HINT[level];

  return (
    <>
      {back}
      <h1 className={styles.heading}>{isNew ? "מנהל חדש" : saved?.name}</h1>

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
            placeholder="name@gmail.com"
          />
          <p className={styles.hint}>חשבון הגוגל שאיתו המנהל ייכנס. הגישה נפתחת מיד.</p>
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
          placeholder="השם שיופיע בקונסולה"
        />
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

      {error && <p className="error">{error}</p>}
      {canRename && (
        <button type="button" className={styles.save} disabled={!dirty || saving} onClick={save}>
          {saving ? "שומר..." : isNew ? "הוספה" : "שמירה"}
        </button>
      )}

      {saved && (
        <>
          <Group title="פרטים">
            <Row label="מייל" value={<bdi dir="ltr">{saved.email}</bdi>} />
            <Row label="נוסף על ידי" value={saved.added_by ? <AdminLabel email={saved.added_by} /> : "ישירות ב-DB"} />
            <Row label="נוסף" value={formatDateTime(saved.created_at)} />
          </Group>
          {canManage && (
            <Group>
              <Row label="הסרת המנהל" danger onClick={() => void remove()} />
            </Group>
          )}
        </>
      )}
    </>
  );
}
