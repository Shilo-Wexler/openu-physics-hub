/** The header's account area: the avatar (a link to the profile) when signed in, a sign-in button for a guest. */

import { Link } from "react-router";

import { useAuth } from "../features/auth/AuthContext";
import Avatar from "../shared/components/Avatar";
import styles from "./AccountArea.module.css";

export default function AccountArea() {
  const { user, loading, requireSignIn } = useAuth();

  // Until /me answers: an empty box of the same size, so a signed-in user does not see
  // "sign in" flash first, and the header does not jump when the answer arrives.
  if (loading) return <span className={styles.placeholder} aria-hidden="true" />;

  if (!user) {
    return (
      <button type="button" className={styles.signIn} onClick={() => requireSignIn()}>
        התחברות
      </button>
    );
  }

  return (
    <Link to="/profile" className={styles.account} aria-label={`הפרופיל שלי (${user.nickname})`}>
      <Avatar avatar={user.avatar} size={32} />
      <span className={styles.nickname}>{user.nickname}</span>
    </Link>
  );
}
