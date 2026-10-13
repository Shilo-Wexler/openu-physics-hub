/** /profile: the signed-in user's nickname and avatar, and sign-out. ?welcome=1 marks the first sign-in. */

import { useState } from "react";
import { useSearchParams } from "react-router";

import { useAuth } from "../auth/AuthContext";
import AvatarPicker from "./AvatarPicker";
import NicknameForm from "./NicknameForm";

export default function ProfilePage() {
  const { user, loading, signOut, signOutAll, requireSignIn } = useAuth();
  const [searchParams] = useSearchParams();
  const welcome = searchParams.get("welcome") === "1";
  const [signOutError, setSignOutError] = useState(false);

  if (loading) return null;

  if (!user) {
    return (
      <section>
        <h1>הפרופיל שלי</h1>
        <p>כדי לבחור כינוי ואווטאר צריך להתחבר.</p>
        <button type="button" onClick={() => requireSignIn()}>
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

  function handleSignOutAll() {
    if (!window.confirm("להתנתק מכל המכשירים, כולל זה?")) return;
    void runSignOut(signOutAll);
  }

  return (
    <section>
      <h1>הפרופיל שלי</h1>
      {welcome && <p>ברוכים הבאים! בחרו כינוי ואווטאר. אפשר לשנות אותם מתי שרוצים.</p>}

      <NicknameForm current={user.nickname} />

      <h2>אווטאר</h2>
      <AvatarPicker current={user.avatar} />

      <h2>חשבון</h2>
      <button type="button" onClick={() => void runSignOut(signOut)}>
        התנתקות
      </button>
      <button type="button" onClick={handleSignOutAll}>
        התנתקות מכל המכשירים
      </button>
      {signOutError && <p role="alert">ההתנתקות נכשלה, נסו שוב</p>}
    </section>
  );
}