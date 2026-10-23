import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router";

import { ApiError, isAbort, isAuthError } from "../../api/client";
import { reportedMessages } from "../../api/chat";
import { getInquiryCounts } from "../../api/inquiries";
import { getMe } from "../../api/me";
import { DEV_SIGN_IN, type Identity } from "../../auth/identity";
import SignIn from "../../auth/SignIn";
import { useIdentity } from "../../auth/useIdentity";
import { ConfirmProvider } from "../../components/ConfirmSheet";
import BottomNav from "../../layout/BottomNav";
import ConsoleHeader from "../../layout/ConsoleHeader";
import { allowed, sectionsFor, type Section } from "../../layout/sections";
import AnnouncementEditorPage from "../announcements/AnnouncementEditorPage";
import AnnouncementListPage from "../announcements/AnnouncementListPage";
import BlockedUserPage from "../chat/BlockedUserPage";
import ChatPage from "../chat/ChatPage";
import ReportPage from "../chat/ReportPage";
import InquiriesPage from "../inquiries/InquiriesPage";
import InquiryDetailPage from "../inquiries/InquiryDetailPage";
import MorePage from "../more/MorePage";
import AdminsTab from "./AdminsTab";
import { AdminContext, useAdmin, useLoad, type AdminContextValue } from "./context";

type Access = "checking" | "ok" | "forbidden" | "error";

export default function AdminPage() {
  const { identity, signIn, signOut, error: signInError } = useIdentity("admin");
  const [access, setAccess] = useState<Access>("checking");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
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
        setRoles(me.roles ?? []);
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
          <p>רעננו את הדף כדי להתחבר שוב.</p>
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
        <h1>כניסת חברי ועדה</h1>
        <section className="card">
          {expired && <p className="notice">ההתחברות פגה. התחברו שוב.</p>}
          <p>הכניסה לחברי הוועדה בלבד.</p>
          <SignIn onEmail={handleEmail} />
          {signInError && <p className="error">{signInError}</p>}
        </section>
      </PlainFrame>
    );
  }

  if (access === "checking") {
    return (
      <PlainFrame>
        <p>בודק הרשאות...</p>
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
                אינו מוגדר כחבר ועדה. אם זו טעות, בקשו ממנהל המערכת להוסיף אותו.
              </p>
            </>
          ) : (
            <p className="error">לא הצלחנו לבדוק את ההרשאות שלך, כי השרת לא זמין. נסו לרענן את הדף.</p>
          )}
          <button className="btn" onClick={signOut}>
            התחברות עם חשבון אחר
          </button>
        </section>
      </PlainFrame>
    );
  }

  return (
    <AdminConsole identity={identity} email={email} roles={roles} onSignOut={signOut} onAuthError={onAuthError} />
  );
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
  roles: string[];
  onSignOut: () => void;
  onAuthError: () => void;
}

function AdminConsole({ identity, email, roles, onSignOut, onAuthError }: ConsoleProps) {
  const sections = useMemo(() => sectionsFor(roles), [roles]);
  const [version, setVersion] = useState(0);
  const changed = useCallback(() => setVersion((v) => v + 1), []);

  const context = useMemo<AdminContextValue>(
    () => ({
      token: identity.token,
      email,
      roles,
      isFullAdmin: roles.includes("admin"),
      version,
      changed,
      onAuthError,
    }),
    [identity.token, email, roles, version, changed, onAuthError],
  );

  return (
    <AdminContext.Provider value={context}>
      {/* Every screen of the console can ask "are you sure?" with useConfirm(). */}
      <ConfirmProvider>
        <ConsoleShell sections={sections} onSignOut={onSignOut} />
      </ConfirmProvider>
    </AdminContext.Provider>
  );
}

/** Inside the context, so it can load the counts for the tab badges. */
function ConsoleShell({ sections, onSignOut }: { sections: Section[]; onSignOut: () => void }) {
  const { roles } = useAdmin();
  const newInquiries = useNewInquiries(allowed(roles, "inquiries"));
  const openReports = useOpenReports();
  const badges = { inquiries: newInquiries, chat: openReports };
  // The first section this admin may see: inquiries for most, the chat for a moderator-only admin.
  const home = sections[0]?.path ?? "/more";

  return (
    <>
      <ConsoleHeader sections={sections} badges={badges} />
      <main>
        <Routes>
          <Route index element={<Navigate to={home} replace />} />
          {/* One guard for every inquiries screen; Outlet is where the matching screen below renders. */}
          <Route
            path="inquiries"
            element={
              <Guard role="inquiries">
                <Outlet />
              </Guard>
            }
          >
            <Route index element={<InquiriesPage />} />
            <Route path=":id" element={<InquiryDetailPage />} />
          </Route>
          <Route path="chat">
            <Route index element={<ChatPage />} />
            <Route path="reports/:id" element={<ReportPage />} />
            <Route path="blocked/:userId" element={<BlockedUserPage />} />
          </Route>
          {/* "new" is matched before ":id", so both open the same form, empty or filled. */}
          <Route
            path="announcements"
            element={
              <Guard role="announcements">
                <Outlet />
              </Guard>
            }
          >
            <Route index element={<AnnouncementListPage />} />
            <Route path="new" element={<AnnouncementEditorPage />} />
            <Route path=":id" element={<AnnouncementEditorPage />} />
          </Route>
          <Route path="more" element={<MorePage onSignOut={onSignOut} />} />
          <Route path="more/admins" element={<AdminsTab />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav sections={sections} badges={badges} />
    </>
  );
}

/** A section opened by URL without its role goes back home. The server refuses the data anyway. */
function Guard({ role, children }: { role: string; children: ReactNode }) {
  const { roles } = useAdmin();
  return allowed(roles, role) ? children : <Navigate to="/" replace />;
}

/** The count on the inquiries tab. Reloads after every change (version); 0 when the admin can't see inquiries. */
function useNewInquiries(enabled: boolean): number {
  const { token, version } = useAdmin();
  const { data } = useLoad(
    (signal) => (enabled ? getInquiryCounts(token, signal) : Promise.resolve(null)),
    [token, version, enabled],
  );
  return data?.new ?? 0;
}

/** The count on the chat tab: messages with open reports. Reloads after every change, like the inquiries count. */
function useOpenReports(): number {
  const { token, version } = useAdmin();
  const { data } = useLoad((signal) => reportedMessages(token, signal), [token, version]);
  return data?.length ?? 0;
}
