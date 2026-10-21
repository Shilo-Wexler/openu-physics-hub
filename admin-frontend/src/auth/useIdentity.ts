import { useCallback, useState } from "react";

import {
  CLOUDFLARE_LOGOUT_URL,
  DEV_SIGN_IN,
  clearIdentity,
  devIdentity,
  loadIdentity,
  saveIdentity,
  type Area,
  type Identity,
} from "./identity";

/** The signed-in identity of one area, plus signIn(email) (dev only) and signOut(). */
export function useIdentity(area: Area) {
  const [identity, setIdentity] = useState<Identity | null>(() => loadIdentity(area));
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(
    (email: string) => {
      const next = devIdentity(email);
      if (!next) {
        setError("ההתחברות נכשלה, כי כתובת המייל לא תקינה. נסו שוב.");
        return;
      }
      setError(null);
      saveIdentity(area, next);
      setIdentity(next);
    },
    [area],
  );

  const signOut = useCallback(() => {
    if (!DEV_SIGN_IN) {
      // Only Cloudflare can end its own session (its cookie is not readable here).
      window.location.assign(CLOUDFLARE_LOGOUT_URL);
      return;
    }
    clearIdentity(area);
    setIdentity(null);
  }, [area]);

  return { identity, signIn, signOut, error };
}
