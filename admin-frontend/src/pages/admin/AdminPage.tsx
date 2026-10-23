import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";

import { ApiError, isAbort, isAuthError } from "../../api/client";
import { getInquiryCounts } from "../../api/inquiries";
import { getMe } from "../../api/me";
import { DEV_SIGN_IN, type Identity } from "../../auth/identity";
import SignIn from "../../auth/SignIn";
import { useIdentity } from "../../auth/useIdentity";
import BottomNav from "../../layout/BottomNav";
import ConsoleHeader from "../../layout/ConsoleHeader";
import { allowed, sectionsFor, type Section } from "../../layout/sections";
import MorePage from "../more/MorePage";
import AdminsTab from "./AdminsTab";
import AnnouncementsTab from "./AnnouncementsTab";
import ChatTab from "./ChatTab";
import { AdminContext, useAdmin, useLoad, type AdminContextValue } from "./context";
import InquiriesTab from "./InquiriesTab";

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
      <ConsoleShell sections={sections} onSignOut={onSignOut} />
    </AdminContext.Provider>
  );
}

/** Inside the context, so it can load the new-inquiries count for the tab badge. */
function ConsoleShell({ sections, onSignOut }: { sections: Section[]; onSignOut: () => void }) {
  const { roles } = useAdmin();
  const newInquiries = useNewInquiries(allowed(roles, "inquiries"));
  const badges = { inquiries: newInquiries };
  // The first section this admin may see: inquiries for most, the chat for a moderator-only admin.
  const home = sections[0]?.path ?? "/more";

  return (
    <>
      <ConsoleHeader sections={sections} badges={badges} />
      <main>
        <Routes>
          <Route index element={<Navigate to={home} replace />} />
          <Route
            path="inquiries"
            element={
              <Guard role="inquiries">
                <InquiriesTab />
              </Guard>
            }
          />
          <Route path="chat" element={<ChatTab />} />
          <Route
            path="announcements"
            element={
              <Guard role="announcements">
                <AnnouncementsTab />
              </Guard>
            }
          />
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