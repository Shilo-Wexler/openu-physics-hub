import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, isAbort, isAuthError } from "../../api/client";
import { getMe, getSummary } from "../../api/requests";
import type { Identity } from "../../auth/identity";
import SignIn from "../../auth/SignIn";
import { useIdentity } from "../../auth/useIdentity";
import { LEVEL_LABEL, levelOf } from "../../lib/levels";
import AdminsTab from "./AdminsTab";
import BlockedTab from "./BlockedTab";
import ChatTab from "./ChatTab";
import { AdminContext, useAdmin, useLoad, type AdminContextValue } from "./context";
import RequestsTab from "./RequestsTab";
import StatsTab from "./StatsTab";

type Access = "checking" | "ok" | "forbidden" | "error";

export default function AdminPage() {
  const { identity, signIn, signOut, error: signInError } = useIdentity("admin");
  const [access, setAccess] = useState<Access>("checking");
  const [roles, setRoles] = useState<string[]>([]);
  const [expired, setExpired] = useState(false);

  const onAuthError = useCallback(() => {
    setExpired(true);
    signOut();
  }, [signOut]);

  const handleToken = useCallback(
    (token: string) => {
      setExpired(false);
      setAccess("checking"); // don't flash the previous account's result
      signIn(token);
    },
    [signIn],
  );

  // Signing in with Google only proves who you are; /api/admin/me checks you are in the admins table.
  useEffect(() => {
    if (!identity) return;
    setAccess("checking");
    const controller = new AbortController();
    getMe(identity.token, controller.signal)
      .then((me) => {
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

  if (!identity) {
    return (
      <>
        <h1>כניסת חברי ועדה</h1>
        <section className="card">
          {expired && <p className="notice">ההתחברות פגה. התחברו שוב.</p>}
          <p>הכניסה לחברי הוועדה בלבד. התחברו עם חשבון הגוגל שהוגדר לכם כאדמין.</p>
          <SignIn onToken={handleToken} />
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
              החשבון <bdi dir="ltr">{identity.email}</bdi> אינו מוגדר כחבר ועדה. אם זו טעות, בקשו ממנהל המערכת
              להוסיף אותו.
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

  return <AdminConsole identity={identity} roles={roles} onSignOut={signOut} onAuthError={onAuthError} />;
}

type Tab = "requests" | "stats" | "blocked" | "chat" | "admins";

const TABS: { id: Tab; label: string }[] = [
  { id: "requests", label: "פניות" },
  { id: "stats", label: "סטטיסטיקה" },
  { id: "blocked", label: "חסימות פניות" },
  { id: "chat", label: "ניהול הצ'אט" },
  { id: "admins", label: "מנהלים" },
];

interface ConsoleProps {
  identity: Identity;
  roles: string[];
  onSignOut: () => void;
  onAuthError: () => void;
}

function AdminConsole({ identity, roles, onSignOut, onAuthError }: ConsoleProps) {
  const [tab, setTab] = useState<Tab>("requests");
  const [version, setVersion] = useState(0);
  const changed = useCallback(() => setVersion((v) => v + 1), []);

  const context = useMemo<AdminContextValue>(
    () => ({
      token: identity.token,
      email: identity.email,
      roles,
      isFullAdmin: roles.includes("admin"),
      version,
      changed,
      onAuthError,
    }),
    [identity.token, identity.email, roles, version, changed, onAuthError],
  );

  return (
    <AdminContext.Provider value={context}>
      <div className="admin-bar">
        <span className="muted">
          <bdi dir="ltr">{identity.email}</bdi> <span className="badge level-badge">{LEVEL_LABEL[levelOf(roles)]}</span>{" "}
          <button className="link-button" onClick={onSignOut}>
            התנתקות
          </button>
        </span>
      </div>

      <SummaryBar />

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
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
