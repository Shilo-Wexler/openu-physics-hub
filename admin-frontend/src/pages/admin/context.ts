import { createContext, useContext, useEffect, useState } from "react";

import { ApiError, isAbort, isAuthError } from "../../api/client";
import { errorMessage } from "../../lib/errors";
import type { Level } from "../../lib/levels";

/** What every admin screen needs: the token, a "data changed" signal, and what to do on 401. */
export interface AdminContextValue {
  token: string;
  /** The signed-in admin's email (lowercase). */
  email: string;
  /** The level from /me. Screens leave out what it may not do; the server checks again. */
  role: Level;
  /** A committee member: no managing admins, and announcements as drafts only. */
  isMember: boolean;
  /** Goes up after every change, so lists and counters reload. */
  version: number;
  changed: () => void;
  onAuthError: () => void;
}

export const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin must be used inside AdminContext");
  return value;
}

export interface Loaded<T> {
  data: T | null;
  loading: boolean;
  failed: boolean;
  /** HTTP status of the failure (0 = no connection), null when nothing failed. */
  errorStatus: number | null;
  /** The server's detail for the failure, if any. */
  errorDetail: string | null;
}

/** Loads data when deps change. A 401 signs the admin out; other errors set failed. */
export function useLoad<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]): Loaded<T> {
  const { onAuthError } = useAdmin();
  const [state, setState] = useState<Loaded<T>>({ data: null, loading: true, failed: false, errorStatus: null, errorDetail: null });

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, failed: false, errorStatus: null, errorDetail: null }));
    load(controller.signal)
      .then((data) => setState({ data, loading: false, failed: false, errorStatus: null, errorDetail: null }))
      .catch((error: unknown) => {
        if (isAbort(error)) return;
        if (isAuthError(error)) {
          onAuthError();
          return;
        }
        console.error(error);
        const errorStatus = error instanceof ApiError ? error.status : 0;
        const errorDetail = error instanceof ApiError ? error.message : null;
        setState((s) => ({ ...s, loading: false, failed: true, errorStatus, errorDetail }));
      });
    return () => controller.abort();
    // The caller lists what the load depends on; `load` itself is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

/** Message for a failed admin action: the standard wording from lib/errors. */
export const actionError = errorMessage;
