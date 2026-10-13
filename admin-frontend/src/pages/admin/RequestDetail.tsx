import { useEffect, useState } from "react";

import { isAbort, isAuthError } from "../../api/client";
import {
  blockEmail,
  closeRequest,
  deleteRequest,
  getRequest,
  markRead,
  markUnread,
  reopenRequest,
  type RequestFull,
  type StateChange,
} from "../../api/requests";
import { formatDateTime } from "../../lib/format";
import { actionError, useAdmin } from "./context";
import StateSwatch, { stateOf } from "./RequestState";

interface Props {
  id: number;
  onClose: () => void;
}

/** One request. Opening it marks it as read, the same as an admin reading it. */
export default function RequestDetail({ id, onClose }: Props) {
  const { token, changed, onAuthError } = useAdmin();
  const [request, setRequest] = useState<RequestFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const loaded = await getRequest(token, id, controller.signal);
        if (!loaded.is_opened) {
          await markRead(token, id);
          loaded.is_opened = true;
          changed();
        }
        setRequest(loaded);
      } catch (e) {
        if (isAbort(e)) return;
        if (isAuthError(e)) onAuthError();
        else setError(actionError(e));
      }
    })();
    return () => controller.abort();
  }, [id, token, changed, onAuthError]);

  function fail(e: unknown) {
    if (isAuthError(e)) onAuthError();
    else setError(actionError(e));
  }

  async function changeState(action: () => Promise<StateChange>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      setRequest((prev) => (prev ? { ...prev, status: result.status, is_opened: result.is_opened } : prev));
      changed();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("למחוק את הפנייה לצמיתות? אי אפשר לשחזר אותה.")) return;
    setBusy(true);
    try {
      await deleteRequest(token, id);
      changed();
      onClose();
    } catch (e) {
      fail(e);
      setBusy(false);
    }
  }

  async function blockSender() {
    if (!request) return;
    const reason = window.prompt(`חסימת ${request.email}. סיבה (לא חובה):`);
    if (reason === null) return;
    setBusy(true);
    setError(null);
    try {
      await blockEmail(token, request.email, reason);
      setNotice("השולח נחסם. הוא לא יוכל לשלוח פניות חדשות.");
      changed();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="card detail">
      <div className="detail-head">
        <h2>פנייה #{id}</h2>
        <button className="link-button" onClick={onClose} aria-label="סגירת החלון">
          ✕
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      {!request && !error && <p className="muted">טוען...</p>}

      {request && (
        <>
          <dl className="meta">
            <dt>מצב</dt>
            <dd>
              <StateSwatch state={stateOf(request.status, request.is_opened)} />
            </dd>
            <dt>שם</dt>
            <dd>{request.full_name}</dd>
            <dt>מייל</dt>
            <dd>
              <a href={`mailto:${request.email}`} dir="ltr">
                {request.email}
              </a>
            </dd>
            <dt>קורס</dt>
            <dd>{request.course_name}</dd>
            <dt>נשלחה</dt>
            <dd>{formatDateTime(request.created_at)}</dd>
          </dl>

          <div className="body-text">{request.body}</div>

          <div className="actions">
            {request.status === "new" && (
              <button className="btn btn-primary" disabled={busy} onClick={() => changeState(() => closeRequest(token, id))}>
                סגירת הפנייה
              </button>
            )}
            {request.status === "closed" && (
              <button className="btn btn-primary" disabled={busy} onClick={() => changeState(() => reopenRequest(token, id))}>
                החזרה לטיפול
              </button>
            )}
            {request.status === "new" && request.is_opened && (
              <button className="btn" disabled={busy} onClick={() => changeState(() => markUnread(token, id))}>
                סימון כלא נקראה
              </button>
            )}
            <button className="btn" disabled={busy} onClick={blockSender}>
              חסימת השולח
            </button>
            <button className="btn btn-danger" disabled={busy} onClick={remove}>
              מחיקה
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
