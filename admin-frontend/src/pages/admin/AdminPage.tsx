import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";

import { listAdmins } from "../../api/admins";
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
import { SECTIONS } from "../../layout/sections";
import type { Level } from "../../lib/levels";
import AnnouncementEditorPage from "../announcements/AnnouncementEditorPage";
import AnnouncementListPage from "../announcements/AnnouncementListPage";
import ActionPage from "../chat/ActionPage";
import BlockedUserPage from "../chat/BlockedUserPage";
import ChatPage from "../chat/ChatPage";
import ReportPage from "../chat/ReportPage";
import InquiriesPage from "../inquiries/InquiriesPage";
import InquiryDetailPage from "../inquiries/InquiryDetailPage";
import MorePage from "../more/MorePage";
import AdminEditorPage from "./AdminEditorPage";
import AdminsListPage from "./AdminsListPage";
import { AdminContext, useAdmin, useLoad, type AdminContextValue } from "./context";

type Access = "checking" | "ok" | "forbidden" | "error";

export default function AdminPage() {
  const { identity, signIn, signOut, error: signInError } = useIdentity("admin");
  const [access, setAccess] = useState<Access>("checking");
  const [email, setEmail] = useState("");
  // Set from /me before the console opens; the lowest level until then.
  const [role, setRole] = useState<Level>("member");
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
      isMember: role === "member",
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
        <ConsoleShell onSignOut={onSignOut} />
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
function ConsoleShell({ onSignOut }: { onSignOut: () => void }) {
  const newInquiries = useNewInquiries();
  const openReports = useOpenReports();
  const badges = { inquiries: newInquiries, chat: openReports };

  return (
    <>
      <ConsoleHeader sections={SECTIONS} badges={badges} />
      <main>
        <Routes>
          <Route index element={<Navigate to="/inquiries" replace />} />
          <Route path="inquiries">
            <Route index element={<InquiriesPage />} />
            <Route path=":id" element={<InquiryDetailPage />} />
          </Route>
          <Route path="chat">
            <Route index element={<ChatPage />} />
            <Route path="reports/:id" element={<ReportPage />} />
            <Route path="blocked/:userId" element={<BlockedUserPage />} />
            <Route path="log/:id" element={<ActionPage />} />
          </Route>
          {/* "new" is matched before ":id", so both open the same form, empty or filled. */}
          <Route path="announcements">
            <Route index element={<AnnouncementListPage />} />
            <Route path="new" element={<AnnouncementEditorPage />} />
            <Route path=":id" element={<AnnouncementEditorPage />} />
          </Route>
          <Route path="more" element={<MorePage onSignOut={onSignOut} />} />
          <Route path="more/admins">
            <Route index element={<AdminsListPage />} />
            <Route path="new" element={<AdminEditorPage />} />
            <Route path=":email" element={<AdminEditorPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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
