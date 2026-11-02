/**
 * /profile: the signed-in user's nickname and avatar, sign-out and account deletion.
 * ?welcome=1 marks the first sign-in, ?restored=1 a sign-in that cancelled a deletion,
 * ?deleted=1 the guest screen right after asking to delete the account.
 * On a desktop: who you are and the account actions in a card on the right, the editing on the left.
 */

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import { useIsDesktop } from "../../shared/browser/useIsDesktop";
import Avatar from "../../shared/components/Avatar";
import { useAuth } from "../auth/AuthContext";
import AvatarPicker from "./AvatarPicker";
import NicknameForm from "./NicknameForm";
import styles from "./ProfilePage.module.css";

export default function ProfilePage() {
  const { user, loading, signOut, deleteAccount, requireSignIn } = useAuth();
  const isDesktop = useIsDesktop();
  const [searchParams, setSearchParams] = useSearchParams();
  const welcome = searchParams.get("welcome") === "1";
  const restored = searchParams.get("restored") === "1";
  const deleted = searchParams.get("deleted") === "1";
  // One error line for the account actions: only one can be in progress at a time.
  const [error, setError] = useState<string | null>(null);
  // "Delete account" was picked once: the row now asks to confirm it, as the chat's ⋯ menu does.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);

  // The focus moves to the confirm button when the question appears, as in the chat's menu.
  useEffect(() => {
    if (confirmingDelete) confirmButton.current?.focus();
  }, [confirmingDelete]);

  if (loading) return null;

  if (!user) {
    return (
      <section className={styles.guest}>
        <Avatar avatar={null} size={72} />
        <h1 className={styles.name}>הפרופיל שלי</h1>
        <p className={styles.guestText}>
          {deleted
            ? "החשבון יימחק בעוד שבוע. התחברות מחדש לפני כן תבטל את המחיקה."
            : "כדי לבחור כינוי ואווטאר צריך להתחבר."}
        </p>
        <button type="button" className={styles.signIn} onClick={() => requireSignIn()}>
          התחברות
        </button>
      </section>
    );
  }

  async function runSignOut() {
    setError(null);
    try {
      await signOut();
    } catch (e) {
      console.error("sign-out failed", e);
      setError("לא הצלחנו להתנתק.");
    }
  }

  async function confirmDelete() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount();
      // The user is a guest now; the guest screen says when the account goes and how to keep it.
      setSearchParams({ deleted: "1" }, { replace: true });
    } catch (e) {
      console.error("account deletion failed", e);
      setError("לא הצלחנו למחוק את החשבון.");
      setDeleting(false);
    }
  }

  // Who you are, large, as on the iPhone's account screen. Reads from `user`, so a new avatar
  // or nickname picked below shows here at once.
  const identity = (
    <header className={styles.identity}>
      <Avatar avatar={user.avatar} size={isDesktop ? 120 : 88} />
      <div className={styles.identityText}>
        <p className={styles.eyebrow}>הפרופיל שלי</p>
        <h1 className={styles.name}>{user.nickname}</h1>
      </div>
    </header>
  );

  const notices = (
    <>
      {welcome && (
        <p className={styles.welcome}>
          ברוכים הבאים! כאן בוחרים כינוי ואווטאר, ואפשר לשנות אותם מתי שרוצים.
        </p>
      )}

      {restored && <p className={styles.welcome}>טוב שחזרת! מחיקת החשבון בוטלה.</p>}
    </>
  );

  const editing = (
    <>
      {/* The form's own label is this part's title. */}
      <section className={styles.section}>
        <NicknameForm current={user.nickname} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>אווטאר</h2>
        <AvatarPicker current={user.avatar} />
      </section>
    </>
  );

  const account = (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>חשבון</h2>
      <ul className={styles.actions}>
        <li>
          <button type="button" className={styles.action} onClick={() => void runSignOut()}>
            התנתקות
          </button>
        </li>
        <li>
          {confirmingDelete ? (
            // The question in place of the row: nothing covers the page, on a phone or a computer.
            <div className={styles.confirmBox} role="group" aria-labelledby="delete-question">
              <p id="delete-question" className={styles.question}>
                למחוק את החשבון?
              </p>
              <p className={styles.confirmText}>
                המחיקה תתבצע בעוד שבוע, ועד אז אפשר לבטל אותה בהתחברות מחדש. אחרי שבוע יימחקו
                הכינוי, האווטאר, הדירוגים והלייקים, וההודעות שכתבת יוסרו מהאתר.
              </p>
              <button
                ref={confirmButton}
                type="button"
                className={styles.confirm}
                disabled={deleting}
                onClick={() => void confirmDelete()}
              >
                כן, למחוק
              </button>
              <button
                type="button"
                className={styles.cancel}
                disabled={deleting}
                onClick={() => setConfirmingDelete(false)}
              >
                ביטול
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={`${styles.action} ${styles.danger}`}
              onClick={() => setConfirmingDelete(true)}
            >
              מחיקת חשבון
            </button>
          )}
        </li>
      </ul>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );

  // A desktop has room for the card beside the editing; a phone keeps one column, account last.
  if (isDesktop) {
    return (
      <div className={styles.columns}>
        <aside className={styles.card} aria-label="החשבון שלי">
          {identity}
          {account}
        </aside>
        <div className={styles.page}>
          {notices}
          {editing}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {identity}
      {notices}
      {editing}
      {account}
    </div>
  );
}
