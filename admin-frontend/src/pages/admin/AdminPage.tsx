import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, isAbort, isAuthError } from "../../api/client";
import { getMe, getSummary } from "../../api/requests";
import { DEV_SIGN_IN, type Identity } from "../../auth/identity";
import SignIn from "../../auth/SignIn";
import { useIdentity } from "../../auth/useIdentity";
import { LEVEL_LABEL, levelOf } from "../../lib/levels";
import AdminsTab from "./AdminsTab";
import AnnouncementsTab from "./AnnouncementsTab";
import BlockedTab from "./BlockedTab";
import ChatTab from "./ChatTab";
import { AdminContext, useAdmin, useLoad, type AdminContextValue } from "./context";
import RequestsTab from "./RequestsTab";
import StatsTab from "./StatsTab";

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
      <section className="card">
        <h1>ההתחברות פגה</h1>
        <p>רעננו את הדף כדי להתחבר שוב.</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          רענון
        </button>
      </section>
    );
  }

  if (!identity) {
    return (
      <>
        <h1>כניסת חברי ועדה</h1>
        <section className="card">
          {expired && <p className="notice">ההתחברות פגה. התחברו שוב.</p>}
          <p>הכניסה לחברי הוועדה בלבד.</p>
          <SignIn onEmail={handleEmail} />
          {signInError && <p className="error">{signInError}</p>}
        </section>
      </>
    );
  }

  if (access === "checking") return <p>בודק הרשאות...</p>;

  if (access === "forbidden" || access === "error") {
    return (
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
    );
  }

  return (
    <AdminConsole identity={identity} email={email} roles={roles} onSignOut={signOut} onAuthError={onAuthError} />
  );
}

type Tab = "requests" | "stats" | "blocked" | "chat" | "announcements" | "admins";

// role: the tab is shown only to admins with that role (or "admin"). The server checks it again.
const TABS: { id: Tab; label: string; role?: string }[] = [
  { id: "requests", label: "פניות" },
  { id: "stats", label: "סטטיסטיקה" },
  { id: "blocked", label: "חסימות פניות" },
  { id: "chat", label: "ניהול הצ'אט" },
  { id: "announcements", label: "הכרזות", role: "announcements" },
  { id: "admins", label: "מנהלים" },
];

interface ConsoleProps {
  identity: Identity;
  /** From /api/admin/me. */
  email: string;
  roles: string[];
  onSignOut: () => void;
  onAuthError: () => void;
}

function AdminConsole({ identity, email, roles, onSignOut, onAuthError }: ConsoleProps) {
  const [tab, setTab] = useState<Tab>("requests");
  const [version, setVersion] = useState(0);
  const changed = useCallback(() => setVersion((v) => v + 1), []);

  const tabs = useMemo(
    () => TABS.filter((t) => !t.role || roles.includes("admin") || roles.includes(t.role)),
    [roles],
  );

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
      <div className="admin-bar">
        <span className="muted">
          <bdi dir="ltr">{email}</bdi> <span className="badge level-badge">{LEVEL_LABEL[levelOf(roles)]}</span>{" "}
          <button className="link-button" onClick={onSignOut}>
            התנתקות
          </button>
        </span>
      </div>

      <SummaryBar />

      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "tab active" : "tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "requests" && <RequestsTab />}
      {tab === "stats" && <StatsTab />}
      {tab === "blocked" && <BlockedTab />}
      {tab === "chat" && <ChatTab />}
      {tab === "announcements" && <AnnouncementsTab />}
      {tab === "admins" && <AdminsTab />}
    </AdminContext.Provider>
  );
}

function SummaryBar() {
  const { token, version } = useAdmin();
  const { data } = useLoad((signal) => getSummary(token, signal), [token, version]);
  const counters = [
    { label: "לא נקראו", value: data?.unread, highlight: true },
    { label: "בטיפול", value: data?.in_progress },
    { label: "נסגרו", value: data?.closed },
    { label: "סה\"כ", value: data?.total },
  ];
  return (
    <div className="counters">
      {counters.map((c) => (
        <div key={c.label} className={c.highlight ? "counter-box highlight" : "counter-box"}>
          <span className="counter-value">{c.value ?? "–"}</span>
          <span className="counter-label">{c.label}</span>
        </div>
      ))}
    </div>
  );
}
