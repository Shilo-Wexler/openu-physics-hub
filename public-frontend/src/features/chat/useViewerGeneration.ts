/** Counts sign-ins and sign-outs on the open page, for data that depends on who is viewing. */

import { useState } from "react";

import { useAuth } from "../auth/AuthContext";

/**
 * A number that goes up when someone signs in or out while the page is open, so data loaded
 * for the old viewer (my_rating, liked_by_me, is_mine) loads again. The first /me answer does
 * not count: the first requests already sent the session cookie.
 */
export function useViewerGeneration(): number {
  const { user, loading } = useAuth();
  const userId = user?.user_id ?? null;
  const [viewer, setViewer] = useState({ loading, userId, generation: 0 });
  if (viewer.loading !== loading || viewer.userId !== userId) {
    const generation = viewer.loading ? viewer.generation : viewer.generation + 1;
    setViewer({ loading, userId, generation });
    return generation;
  }
  return viewer.generation;
}