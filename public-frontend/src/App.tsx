import { lazy, Suspense, useEffect } from "react";
import { Route, Routes } from "react-router";

import { GENERAL_COURSE_ID } from "./shared/api/chat";
import PageLoading from "./shared/components/PageLoading";
import AnnouncementsPage from "./features/announcements/AnnouncementsPage";
import SignInDialog from "./features/auth/SignInDialog";
import HomePage from "./features/home/HomePage";
import BottomNav from "./layout/BottomNav";
import SiteFooter from "./layout/SiteFooter";
import SiteHeader from "./layout/SiteHeader";

// Loaded with the site: the frame, the home page and the announcements (the pinned one is on the home page).
// Every other page is its own file, so the first visit downloads less.
const PAGES = {
  about: () => import("./features/about/AboutPage"),
  privacy: () => import("./features/about/PrivacyPage"),
  signInDone: () => import("./features/auth/SignInDonePage"),
  chatHub: () => import("./features/chat/ChatHubPage"),
  courseChat: () => import("./features/chat/CourseChatPage"),
  courses: () => import("./features/courses/CoursesPage"),
  inquiry: () => import("./features/inquiry/InquiryPage"),
  notFound: () => import("./features/not-found/NotFoundPage"),
  profile: () => import("./features/profile/ProfilePage"),
};

const AboutPage = lazy(PAGES.about);
const PrivacyPage = lazy(PAGES.privacy);
const SignInDonePage = lazy(PAGES.signInDone);
const ChatHubPage = lazy(PAGES.chatHub);
const CourseChatPage = lazy(PAGES.courseChat);
const CoursesPage = lazy(PAGES.courses);
const InquiryPage = lazy(PAGES.inquiry);
const NotFoundPage = lazy(PAGES.notFound);
const ProfilePage = lazy(PAGES.profile);

/** Once the first page has loaded and the browser is idle, downloads the other pages in the background,
    so a click later opens its page at once instead of waiting for its file. Each file is fetched once. */
function usePrefetchPages() {
  useEffect(() => {
    const prefetch = () => Object.values(PAGES).forEach((load) => void load().catch(() => undefined));
    // Safari has no requestIdleCallback: a short delay instead.
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(prefetch, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(prefetch, 1500);
    return () => clearTimeout(timer);
  }, []);
}

/** The site frame (header, footer, phone bottom bar) around the page of the current route. */
export default function App() {
  usePrefetchPages();

  return (
    <>
      <SiteHeader />
      <SignInDialog />

      <main>
        <Suspense fallback={<PageLoading />}>
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
        </Suspense>
      </main>

      <SiteFooter />
      <BottomNav />
    </>
  );
}
