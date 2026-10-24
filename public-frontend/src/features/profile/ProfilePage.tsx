/** /profile: the signed-in user's nickname and avatar, and sign-out. ?welcome=1 marks the first sign-in. */

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import Avatar from "../../shared/components/Avatar";
import { useAuth } from "../auth/AuthContext";
import AvatarPicker from "./AvatarPicker";
import NicknameForm from "./NicknameForm";
import styles from "./ProfilePage.module.css";

export default function ProfilePage() {
  const { user, loading, signOut, signOutAll, requireSignIn } = useAuth();
  const [searchParams] = useSearchParams();
  const welcome = searchParams.get("welcome") === "1";
  const [signOutError, setSignOutError] = useState(false);
  // "Sign out everywhere" was picked once: the row now asks to confirm it, as the chat's ⋯ menu does.
  const [confirmingAll, setConfirmingAll] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);

  // The focus moves to the confirm button when the question appears, as in the chat's menu.
  useEffect(() => {
    if (confirmingAll) confirmButton.current?.focus();
  }, [confirmingAll]);

  if (loading) return null;

  if (!user) {
    return (
      <section className={styles.guest}>
        <Avatar avatar={null} size={72} />
        <h1 className={styles.name}>הפרופיל שלי</h1>
        <p className={styles.guestText}>כדי לבחור כינוי ואווטאר צריך להתחבר.</p>
        <button type="button" className={styles.signIn} onClick={() => requireSignIn()}>
          התחברות
        </button>
      </section>
    );
  }

  // Both sign-outs share one error line: only one can be in progress at a time.
  async function runSignOut(action: () => Promise<void>) {
    setSignOutError(false);
    try {
      await action();
    } catch (error) {
      console.error("sign-out failed", error);
      setSignOutError(true);
    }
  }

  function signOutEverywhere() {
    setConfirmingAll(false);
    void runSignOut(signOutAll);
  }

  return (
    <div className={styles.page}>
      {/* Who you are, large, as on the iPhone's account screen. Reads from `user`, so a
          new avatar or nickname picked below shows here at once. */}
      <header className={styles.identity}>
        <Avatar avatar={user.avatar} size={88} />
        <div className={styles.identityText}>
          <p className={styles.eyebrow}>הפרופיל שלי</p>
          <h1 className={styles.name}>{user.nickname}</h1>
        </div>
      </header>

      {welcome && (
        <p className={styles.welcome}>
          ברוכים הבאים! כאן בוחרים כינוי ואווטאר, ואפשר לשנות אותם מתי שרוצים.
        </p>
      )}

      {/* The form's own label is this part's title. */}
      <section className={styles.section}>
        <NicknameForm current={user.nickname} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>אווטאר</h2>
        <AvatarPicker current={user.avatar} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>חשבון</h2>
        <ul className={styles.actions}>
          <li>
            <button
              type="button"
              className={styles.action}
              onClick={() => void runSignOut(signOut)}
            >
              התנתקות
            </button>
          </li>
          <li>
            {confirmingAll ? (
              // The question in place of the row: nothing covers the page, on a phone or a computer.
              <div className={styles.confirmBox} role="group" aria-labelledby="sign-out-all-question">
                <p id="sign-out-all-question" className={styles.question}>
                  להתנתק מכל המכשירים, כולל זה?
                </p>
                <button
                  ref={confirmButton}
                  type="button"
                  className={styles.confirm}
                  onClick={signOutEverywhere}
                >
                  כן, להתנתק מכולם
                </button>
                <button type="button" className={styles.cancel} onClick={() => setConfirmingAll(false)}>
                  ביטול
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={`${styles.action} ${styles.danger}`}
                onClick={() => setConfirmingAll(true)}
              >
                התנתקות מכל המכשירים
              </button>
            )}
          </li>
        </ul>
        {signOutError && (
          <p className={styles.error} role="alert">
            לא הצלחנו להתנתק.
          </p>
        )}
      </section>
    </div>
  );
}
