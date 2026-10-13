import { useCallback, useState } from "react";

import { clearIdentity, identityFromToken, loadIdentity, saveIdentity, type Area, type Identity } from "./identity";

/** The signed-in identity of one area, plus signIn(token) and signOut(). */
export function useIdentity(area: Area) {
  const [identity, setIdentity] = useState<Identity | null>(() => loadIdentity(area));
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(
    (token: string) => {
      const next = identityFromToken(token);
      if (!next) {
        setError("ההתחברות נכשלה, כי לא התקבלה כתובת מייל מהחשבון. נסו שוב.");
        return;
      }
      setError(null);
      saveIdentity(area, next);
      setIdentity(next);
    },
    [area],
  );

  const signOut = useCallback(() => {
    clearIdentity(area);
    setIdentity(null);
  }, [area]);

  return { identity, signIn, signOut, error };
}
