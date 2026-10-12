import { NavLink, Route, Routes } from "react-router";

import { useAuth } from "./features/auth/AuthContext";
import GoogleButton from "./features/auth/GoogleButton";
import Avatar from "./shared/components/Avatar";
import CoursesPage from "./features/courses/CoursesPage";
import CourseChatPage from "./features/chat/CourseChatPage";

// Temporary stand-in until each page gets its own file in src/pages/.
function Placeholder({ title }: { title: string }) {
  return <h1>{title}</h1>;
}

/** The header's account area: Google's button for a guest, avatar + nickname when signed in. */
function AccountArea() {
  const { user, loading, signOut } = useAuth();

  // Show nothing until /me answers, so a signed-in user does not see "sign in" flash first.
  if (loading) return null;
  if (!user) return <GoogleButton />;

  return (
    <div>
      <Avatar avatar={user.avatar} size={28} />
      <span>{user.nickname}</span>
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

      <main>
        <Routes>
          <Route path="/" element={<Placeholder title="דף הבית" />} />
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/courses/:courseId" element={<CourseChatPage />} />
          <Route path="/courses/:courseId/m/:messageId" element={<CourseChatPage />} />
          <Route path="/about" element={<Placeholder title="אודות" />} />
          <Route path="*" element={<Placeholder title="הדף לא נמצא" />} />
        </Routes>
      </main>
    </>
  );
}
