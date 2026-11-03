import { Route, Routes } from "react-router";

import { GENERAL_COURSE_ID } from "./shared/api/chat";
import { useRouteTitle } from "./shared/browser/usePageTitle";
import AboutPage from "./features/about/AboutPage";
import PrivacyPage from "./features/about/PrivacyPage";
import AnnouncementsPage from "./features/announcements/AnnouncementsPage";
import SignInDialog from "./features/auth/SignInDialog";
import SignInDonePage from "./features/auth/SignInDonePage";
import ChatHubPage from "./features/chat/ChatHubPage";
import CourseChatPage from "./features/chat/CourseChatPage";
import CoursesPage from "./features/courses/CoursesPage";
import HomePage from "./features/home/HomePage";
import InquiryPage from "./features/inquiry/InquiryPage";
import NotFoundPage from "./features/not-found/NotFoundPage";
import ProfilePage from "./features/profile/ProfilePage";
import BottomNav from "./layout/BottomNav";
import SiteFooter from "./layout/SiteFooter";
import SiteHeader from "./layout/SiteHeader";

/** The site frame (header, footer, phone bottom bar) around the page of the current route. */
export default function App() {
  useRouteTitle();

  return (
    <>
      <SiteHeader />
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
          <Route path="/announcements" element={<AnnouncementsPage />} />
          <Route path="/inquiry" element={<InquiryPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          {/* The server sends the tab here after Google sign-in. */}
          <Route path="/auth/done" element={<SignInDonePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>

      <SiteFooter />
      <BottomNav />
    </>
  );
}
