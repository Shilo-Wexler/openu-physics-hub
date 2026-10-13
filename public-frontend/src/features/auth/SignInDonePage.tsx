/**
 * /auth/done: where the server sends the tab back after Google sign-in.
 * ?new=1 is a brand-new account, ?error=1 a failed sign-in; otherwise it is a returning user.
 * The page load itself already asked /me (AuthProvider), so the header shows the new user.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { useAuth } from "./AuthContext";
import { takeReturnPath } from "./signInReturn";
import styles from "./SignInDonePage.module.css";

export default function SignInDonePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { requireSignIn } = useAuth();
  // Set only when sign-in failed: the page the visitor came from, for the "back" link.
  const [failedFrom, setFailedFrom] = useState<string | null>(null);

  // The saved path is read once. In development React runs effects twice; the ref survives
  // that, so the second run does not find the path already gone and send the user home.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const returnPath = takeReturnPath();
    if (params.get("error") === "1") {
      setFailedFrom(returnPath);
      return;
    }
    // replace: the back button should not land on this in-between page.
    navigate(params.get("new") === "1" ? "/profile?welcome=1" : returnPath, { replace: true });
  }, [params, navigate]);

  if (failedFrom === null) return null; // only for a moment, until the redirect above

  return (
    <section className={styles.page}>
      <h1 className={styles.title}>ההתחברות לא הצליחה</h1>
      <p className={styles.text}>משהו השתבש בדרך מ-Google. אפשר לנסות שוב.</p>
      <div className={styles.actions}>
        <button type="button" className={styles.retry} onClick={() => requireSignIn()}>
          לנסות שוב
        </button>
        <Link to={failedFrom} replace className={styles.back}>
          חזרה
        </Link>
      </div>
    </section>
  );
}
