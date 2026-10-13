/** The sign-in dialog: opened by requireSignIn(), from the header's sign-in button or when a guest tries to write. */

import { useEffect, useRef } from "react";

import { useAuth } from "./AuthContext";
import GoogleButton from "./GoogleButton";
import styles from "./SignInDialog.module.css";

export default function SignInDialog() {
  const { signInPromptOpen, closeSignInPrompt } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // showModal() is the browser's own modal: focus stays inside, Esc closes it,
  // and the page behind cannot be clicked.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (signInPromptOpen && !dialog.open) dialog.showModal();
    if (!signInPromptOpen && dialog.open) dialog.close();
  }, [signInPromptOpen]);

  return (
    // onClose also fires on Esc, so the state follows the browser.
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      onClose={closeSignInPrompt}
      aria-labelledby="sign-in-title"
    >
      <h2 id="sign-in-title" className={styles.title}>
        התחברות
      </h2>
      <p className={styles.text}>
        קריאה פתוחה לכולם. כדי לכתוב, לעשות לייק או לדרג צריך להתחבר עם Google. אנחנו לא שומרים
        שם, אימייל או תמונה.
      </p>
      {/* Mounted only while open, so Google's script loads only when someone wants to sign in.
          The tab then goes to Google, and /auth/done decides where to land (a new account goes
          to the profile page). */}
      {signInPromptOpen && <GoogleButton />}
      <button type="button" className={styles.later} onClick={closeSignInPrompt}>
        לא עכשיו
      </button>
    </dialog>
  );
}