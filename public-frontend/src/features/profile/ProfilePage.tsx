/** /profile: the signed-in user's nickname and avatar. ?welcome=1 marks the first sign-in. */

import { useState } from "react";
import { useSearchParams } from "react-router";

import { useAuth } from "../auth/AuthContext";
import AvatarPicker from "./AvatarPicker";
import NicknameForm from "./NicknameForm";

export default function ProfilePage() {
  const { user, loading, signOutAll } = useAuth();
  const [searchParams] = useSearchParams();
  const welcome = searchParams.get("welcome") === "1";
  const [signOutFailed, setSignOutFailed] = useState(false);

  if (loading) return null;

  if (!user) {
    return (
      <section>
        <h1>הפרופיל שלי</h1>
        <p>כדי לבחור כינוי ואווטאר צריך להתחבר, בכפתור שלמעלה.</p>
      </section>
    );
  }

  async function handleSignOutAll() {
    if (!window.confirm("להתנתק מכל המכשירים, כולל זה?")) return;
    setSignOutFailed(false);
    try {
      await signOutAll();
    } catch (error) {
      console.error("sign-out from all devices failed", error);
      setSignOutFailed(true);
    }
  }

  return (
    <section>
      <h1>הפרופיל שלי</h1>
      {welcome && <p>ברוכים הבאים! בחרו כינוי ואווטאר. אפשר לשנות אותם מתי שרוצים.</p>}

      <NicknameForm current={user.nickname} />

      <h2>אווטאר</h2>
      <AvatarPicker current={user.avatar} />

      <h2>אבטחה</h2>
      <button type="button" onClick={() => void handleSignOutAll()}>
        התנתקות מכל המכשירים
      </button>
      {signOutFailed && <p role="alert">ההתנתקות נכשלה, נסו שוב</p>}
    </section>
  );
}