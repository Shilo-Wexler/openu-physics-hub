/** Who is signed in, for the whole app. Asks the server once on load, then updates locally. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { getMe, logout, logoutAll, signInWithGoogle } from "../../shared/api/chat";
import type { Me, SignInResult } from "../../shared/api/chat";

interface Auth {
  user: Me | null; // null for a guest (and while loading)
  loading: boolean; // true until the first /me answer, so the header does not flash "sign in"
  signIn: (idToken: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  signOutAll: () => Promise<void>; // ends the sessions on every device
  updateUser: (changes: Partial<Me>) => void; // after a nickname or avatar change
  /** For write actions: true when signed in; for a guest, opens the sign-in dialog and returns false. */
  requireSignIn: () => boolean;
  signInPromptOpen: boolean;
  closeSignInPrompt: () => void;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [signInPromptOpen, setSignInPromptOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getMe(controller.signal)
      .then(setUser)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // 401 is the normal answer for a guest. Any other failure also leaves the visitor
        // as a guest: reading the site works without sign-in, so this is not worth an error.
        setUser(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const signIn = useCallback(async (idToken: string) => {
    const result = await signInWithGoogle(idToken);
    const { is_new: _isNew, ...me } = result;
    setUser(me);
    setSignInPromptOpen(false); // signed in from the dialog: it has done its job
    return result; // the caller uses is_new to offer a nickname change
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    setUser(null);
  }, []);

  const signOutAll = useCallback(async () => {
    await logoutAll();
    setUser(null);
  }, []);

  const updateUser = useCallback((changes: Partial<Me>) => {
    setUser((current) => (current ? { ...current, ...changes } : current));
  }, []);

  const requireSignIn = useCallback(() => {
    if (user) return true;
    setSignInPromptOpen(true);
    return false;
  }, [user]);

  const closeSignInPrompt = useCallback(() => setSignInPromptOpen(false), []);

  // A new object only when something changed, so components that use auth do not re-render
  // on every render of the provider.
  const value = useMemo(
    () => ({
      user,
      loading,
      signIn,
      signOut,
      signOutAll,
      updateUser,
      requireSignIn,
      signInPromptOpen,
      closeSignInPrompt,
    }),
    [user, loading, signIn, signOut, signOutAll, updateUser, requireSignIn, signInPromptOpen, closeSignInPrompt],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with its provider
export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (auth === null) throw new Error("useAuth must be used inside AuthProvider");
  return auth;
}