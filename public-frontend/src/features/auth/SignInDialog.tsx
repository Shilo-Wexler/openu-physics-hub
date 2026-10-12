/** "Sign in to continue": opened by requireSignIn() when a guest tries to write. */

import { useEffect, useRef } from "react";

import { useAuth } from "./AuthContext";
import GoogleButton from "./GoogleButton";

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
    <dialog ref={dialogRef} onClose={closeSignInPrompt} aria-labelledby="sign-in-title">
      <h2 id="sign-in-title">התחברו כדי להמשיך</h2>
      <p>
        קריאה פתוחה לכולם. כדי לכתוב, לעשות לייק או לדרג צריך להתחבר עם Google. אנחנו לא שומרים
        שם, אימייל או תמונה.
      </p>
      {/* Mounted only while open, so it is the newest button and handles the sign-in. */}
      {signInPromptOpen && <GoogleButton />}
      <button type="button" onClick={closeSignInPrompt}>
        לא עכשיו
      </button>
    </dialog>
  );
}