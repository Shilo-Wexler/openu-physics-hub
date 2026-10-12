import { Link, NavLink, Route, Routes, useNavigate } from "react-router";

import { useAuth } from "./features/auth/AuthContext";
import GoogleButton from "./features/auth/GoogleButton";
import CourseChatPage from "./features/chat/CourseChatPage";
import CoursesPage from "./features/courses/CoursesPage";
import ProfilePage from "./features/profile/ProfilePage";
import SignInDialog from "./features/auth/SignInDialog";
import Avatar from "./shared/components/Avatar";

// Temporary stand-in until each page gets its own feature folder.
function Placeholder({ title }: { title: string }) {
  return <h1>{title}</h1>;
}

/** The header's account area: Google's button for a guest, avatar + nickname when signed in. */
function AccountArea() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  // Show nothing until /me answers, so a signed-in user does not see "sign in" flash first.
  if (loading) return null;

  if (!user) {
    return (
      <GoogleButton
        onSignedIn={(result) => {
          // A brand-new account goes straight to pick a nickname and avatar.
          if (result.is_new) navigate("/profile?welcome=1");
        }}
      />
    );
  }

  return (
    <div>
      <Link to="/profile" aria-label="הפרופיל שלי">
        <Avatar avatar={user.avatar} size={28} />
        <span>{user.nickname}</span>
      </Link>
      <button
        type="button"
        onClick={() => signOut().catch((error: unknown) => console.error("sign-out failed", error))}
      >
        התנתקות
      </button>
    </div>
  );
}

export default function App() {
  return (
    <>
      <header>
        <nav>
          <NavLink to="/" end>
            ראשי
          </NavLink>
          <NavLink to="/courses">קורסים</NavLink>
          <NavLink to="/about">אודות</NavLink>
        </nav>
        <AccountArea />
      </header>
      <SignInDialog />

      <main>
        <Routes>
          <Route path="/" element={<Placeholder title="דף הבית" />} />
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/courses/:courseId" element={<CourseChatPage />} />
          <Route path="/courses/:courseId/m/:messageId" element={<CourseChatPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/about" element={<Placeholder title="אודות" />} />
          <Route path="*" element={<Placeholder title="הדף לא נמצא" />} />
        </Routes>
      </main>
    </>
  );
}
