import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";

import { listAdmins } from "../shared/api/admins";
import { reportedMessages } from "../shared/api/chat";
import { ApiError, isAbort, isAuthError } from "../shared/api/client";
import { getInquiryCounts } from "../shared/api/inquiries";
import { getMe } from "../shared/api/me";
import { ConfirmProvider } from "../shared/components/ConfirmSheet";
import PageLoading from "../shared/components/PageLoading";
import SplitView from "../shared/components/SplitView";
import type { Level } from "../shared/lib/levels";
import AdminsListPage, { NewAdminLink } from "../features/admins/AdminsListPage";
import AnnouncementListPage, { NewAnnouncementLink } from "../features/announcements/AnnouncementListPage";
import { DEV_SIGN_IN, type Identity } from "../features/auth/identity";
import SignIn from "../features/auth/SignIn";
import { useIdentity } from "../features/auth/useIdentity";
import InquiriesPage from "../features/inquiries/InquiriesPage";
import InquiryDetailPage from "../features/inquiries/InquiryDetailPage";
import MeetingListPage, { NewMeetingLink } from "../features/meetings/MeetingListPage";
import BottomNav from "./BottomNav";
import ConsoleHeader from "./ConsoleHeader";
import { AdminContext, useAdmin, useLoad, type AdminContextValue } from "./consoleContext";
import { SECTIONS } from "./sections";

// Loaded with the console: the inquiries (the first screen) and the lists whose "new" buttons sit in
// the header. The editors and the other sections are files of their own, downloaded in the background
// once the console is open (usePrefetchScreens), so the first load is lighter and a click is still instant.
const SCREENS = {
  adminEditor: () => import("../features/admins/AdminEditorPage"),
  announcementEditor: () => import("../features/announcements/AnnouncementEditorPage"),
  chatAction: () => import("../features/chat/ActionPage"),
  chatBlocked: () => import("../features/chat/BlockedUserPage"),
  chat: () => import("../features/chat/ChatPage"),
  chatReport: () => import("../features/chat/ReportPage"),
  meetingEditor: () => import("../features/meetings/MeetingEditorPage"),
  more: () => import("../features/more/MorePage"),
  stats: () => import("../features/stats/StatsPage"),
};

const AdminEditorPage = lazy(SCREENS.adminEditor);
const AnnouncementEditorPage = lazy(SCREENS.announcementEditor);
const ActionPage = lazy(SCREENS.chatAction);
const BlockedUserPage = lazy(SCREENS.chatBlocked);
const ChatPage = lazy(SCREENS.chat);
const ReportPage = lazy(SCREENS.chatReport);
const MeetingEditorPage = lazy(SCREENS.meetingEditor);
const MorePage = lazy(SCREENS.more);
const StatsPage = lazy(SCREENS.stats);

/** Once the console is open and the browser is idle, downloads the other screens in the background,
    so a click opens its screen at once instead of waiting for its file. Each file is fetched once. */
function usePrefetchScreens() {
  useEffect(() => {
    const prefetch = () => Object.values(SCREENS).forEach((load) => void load().catch(() => undefined));
    // Safari has no requestIdleCallback: a short delay instead.
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(prefetch, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(prefetch, 1500);
    return () => clearTimeout(timer);
  }, []);
}

type Access = "checking" | "ok" | "forbidden" | "error";

export default function ConsoleShell() {
  const { identity, signIn, signOut, error: signInError } = useIdentity("admin");
  const [access, setAccess] = useState<Access>("checking");
  const [email, setEmail] = useState("");
  // Set from /me before the console opens; the lowest level until then.
  const [role, setRole] = useState<Level>("team");
  const [expired, setExpired] = useState(false);

  // In dev, back to the email box. In production the page shows "expired" with a reload button:
  // reloading by itself could loop forever if Cloudflare is not in front of the console.
  const onAuthError = useCallback(() => {
    setExpired(true);
    if (DEV_SIGN_IN) signOut();
  }, [signOut]);

  const handleEmail = useCallback(
    (devEmail: string) => {
      setExpired(false);
      setAccess("checking"); // don't flash the previous account's result
      signIn(devEmail);
    },
    [signIn],
  );

  // Signing in (Cloudflare, or the dev box) only proves who you are; /api/admin/me checks you are in the admins table.
  useEffect(() => {
    if (!identity) return;
    setAccess("checking");
    const controller = new AbortController();
    getMe(identity.token, controller.signal)
      .then((me) => {
        setEmail(me.email);
        setRole(me.role);
        setAccess("ok");
      })
      .catch((error: unknown) => {
        if (isAbort(error)) return;
        if (isAuthError(error)) onAuthError();
        else if (error instanceof ApiError && error.status === 403) setAccess("forbidden");
        else setAccess("error");
      });
    return () => controller.abort();
  }, [identity, onAuthError]);

  if (expired && !DEV_SIGN_IN) {
    return (
      <PlainFrame>
        <section className="card">
          <h1>ההתחברות פגה</h1>
          <p>אפשר לרענן את הדף ולהתחבר שוב.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            רענון
          </button>
        </section>
      </PlainFrame>
    );
  }

  if (!identity) {
    return (
      <PlainFrame>
        <h1>כניסת צוות</h1>
        <section className="card">
          {expired && <p className="notice">ההתחברות פגה. אפשר להתחבר שוב.</p>}
          <p>הכניסה לחברי הוועד בלבד.</p>
          <SignIn onEmail={handleEmail} />
          {signInError && <p className="error">{signInError}</p>}
        </section>
      </PlainFrame>
    );
  }

  if (access === "checking") {
    return (
      <PlainFrame>
        <p>בודק הרשאות…</p>
      </PlainFrame>
    );
  }

  if (access === "forbidden" || access === "error") {
    return (
      <PlainFrame>
        <section className="card">
          {access === "forbidden" ? (
            <>
              <h1>אין הרשאה</h1>
              <p>
                {identity.email ? (
                  <>
                    החשבון <bdi dir="ltr">{identity.email}</bdi>
                  </>
                ) : (
                  "החשבון שהתחברת איתו"
                )}{" "}
                אינו ברשימת הצוות. אם זו טעות, אפשר לבקש ממנהל להוסיף אותו.
              </p>
            </>
          ) : (
            <p className="error">
              לא הצלחנו לבדוק את ההרשאות שלך, כי השרת לא זמין. אפשר לרענן את הדף ולנסות שוב.
            </p>
          )}
          <button className="btn" onClick={signOut}>
            התחברות עם חשבון אחר
          </button>
        </section>
      </PlainFrame>
    );
  }

  return <AdminConsole identity={identity} email={email} role={role} onSignOut={signOut} onAuthError={onAuthError} />;
}

/** The header and page area without sections: for the screens before the console opens. */
function PlainFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <ConsoleHeader sections={[]} />
      <main>{children}</main>
    </>
  );
}

interface ConsoleProps {
  identity: Identity;
  /** From /api/admin/me. */
  email: string;
  role: Level;
  onSignOut: () => void;
  onAuthError: () => void;
}

function AdminConsole({ identity, email, role, onSignOut, onAuthError }: ConsoleProps) {
  const [version, setVersion] = useState(0);
  const changed = useCallback(() => setVersion((v) => v + 1), []);
  const names = useAdminNames(identity.token, version, onAuthError);
  const nameOf = useCallback((adminEmail: string) => names.get(adminEmail) ?? null, [names]);

  const context = useMemo<AdminContextValue>(
    () => ({
      token: identity.token,
      email,
      role,
      isTeam: role === "team",
      nameOf,
      version,
      changed,
      onAuthError,
    }),
    [identity.token, email, role, nameOf, version, changed, onAuthError],
  );

  return (
    <AdminContext.Provider value={context}>
      {/* Every screen of the console can ask "are you sure?" with useConfirm(). */}
      <ConfirmProvider>
        <ConsoleRoutes onSignOut={onSignOut} />
      </ConfirmProvider>
    </AdminContext.Provider>
  );
}

/** Admins' names by email, so screens show a name instead of an email. Reloads after every change
    (a rename, a new admin). If the list fails to load, screens just show the emails. */
function useAdminNames(token: string, version: number, onAuthError: () => void): Map<string, string> {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const controller = new AbortController();
    listAdmins(token, controller.signal)
      .then((admins) => setNames(new Map(admins.map((a) => [a.email, a.name]))))
      .catch((error: unknown) => {
        if (isAbort(error)) return;
        if (isAuthError(error)) onAuthError();
        else console.error(error);
      });
    return () => controller.abort();
  }, [token, version, onAuthError]);
  return names;
}

/** Inside the context, so it can load the counts for the tab badges. Every level sees every section. */
function ConsoleRoutes({ onSignOut }: { onSignOut: () => void }) {
  const newInquiries = useNewInquiries();
  const openReports = useOpenReports();
  const badges = { inquiries: newInquiries, chat: openReports };
  usePrefetchScreens();

  return (
    <>
      <ConsoleHeader sections={SECTIONS} badges={badges} />
      <main>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route index element={<Navigate to="/inquiries" replace />} />
            {/* On a computer the list and the open inquiry share the screen; on a phone they are two screens. */}
            <Route
              path="inquiries"
              element={<SplitView base="/inquiries" title="פניות" list={<InquiriesPage />} empty="אין פנייה פתוחה." />}
            >
              <Route path=":id" element={<InquiryDetailPage />} />
            </Route>
            <Route
              path="chat"
              element={<SplitView base="/chat" title="צ'אט" list={<ChatPage />} empty="אין מה להציג כאן." />}
            >
              <Route path="reports/:id" element={<ReportPage />} />
              <Route path="blocked/:userId" element={<BlockedUserPage />} />
              <Route path="log/:id" element={<ActionPage />} />
            </Route>
            {/* "new" is matched before ":id", so both open the same form, empty or filled. */}
            <Route
              path="announcements"
              element={
                <SplitView
                  base="/announcements"
                  title="הכרזות"
                  action={<NewAnnouncementLink />}
                  list={<AnnouncementListPage />}
                  empty="עוד אין הכרזות."
                />
              }
            >
              <Route path="new" element={<AnnouncementEditorPage />} />
              <Route path=":id" element={<AnnouncementEditorPage />} />
            </Route>
            <Route path="stats" element={<StatsPage />} />
            <Route path="more" element={<MorePage onSignOut={onSignOut} />} />
            <Route
              path="more/admins"
              element={
                <SplitView
                  base="/more/admins"
                  title="צוות"
                  action={<NewAdminLink />}
                  list={<AdminsListPage />}
                  empty="אין חברי צוות."
                />
              }
            >
              <Route path="new" element={<AdminEditorPage />} />
              <Route path=":email" element={<AdminEditorPage />} />
            </Route>
            <Route
              path="more/meetings"
              element={
                <SplitView
                  base="/more/meetings"
                  title="סיכומי ישיבות"
                  action={<NewMeetingLink />}
                  list={<MeetingListPage />}
                  empty="עוד אין סיכומים."
                />
              }
            >
              <Route path="new" element={<MeetingEditorPage />} />
              <Route path=":id" element={<MeetingEditorPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <BottomNav sections={SECTIONS} badges={badges} />
    </>
  );
}

/** The count on the inquiries tab. Reloads after every change (version). */
function useNewInquiries(): number {
  const { token, version } = useAdmin();
  const { data } = useLoad((signal) => getInquiryCounts(token, signal), [token, version]);
  return data?.new ?? 0;
}

/** The count on the chat tab: messages with open reports. Reloads after every change, like the inquiries count. */
function useOpenReports(): number {
  const { token, version } = useAdmin();
  const { data } = useLoad((signal) => reportedMessages(token, signal), [token, version]);
  return data?.length ?? 0;
}
