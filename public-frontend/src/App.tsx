import { Link, NavLink, Route, Routes, useNavigate } from "react-router";

import { GENERAL_COURSE_ID } from "./shared/api/chat";
import AboutPage from "./features/about/AboutPage";
import { useAuth } from "./features/auth/AuthContext";
import GoogleButton from "./features/auth/GoogleButton";
import ChatHubPage from "./features/chat/ChatHubPage";
import CourseChatPage from "./features/chat/CourseChatPage";
import CoursesPage from "./features/courses/CoursesPage";
import HomePage from "./features/home/HomePage";
import InquiryPage from "./features/inquiry/InquiryPage";
import NotFoundPage from "./features/not-found/NotFoundPage";
import ProfilePage from "./features/profile/ProfilePage";
import SignInDialog from "./features/auth/SignInDialog";
import Avatar from "./shared/components/Avatar";

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
          <NavLink to="/chat">צ'אט</NavLink>
          <NavLink to="/about">אודות</NavLink>
        </nav>
        <AccountArea />
      </header>
      <SignInDialog />

      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/chat" element={<ChatHubPage />} />
          <Route path="/chat/general" element={<CourseChatPage courseId={GENERAL_COURSE_ID} />} />
          <Route
            path="/chat/general/m/:messageId"
            element={<CourseChatPage courseId={GENERAL_COURSE_ID} />}
          />
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/courses/:courseId" element={<CourseChatPage />} />
          <Route path="/courses/:courseId/m/:messageId" element={<CourseChatPage />} />
          <Route path="/inquiry" element={<InquiryPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </>
  );
}
