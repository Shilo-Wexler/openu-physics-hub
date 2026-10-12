/** Heart and count. A click likes, a second click unlikes; the change shows at once. */

import { useRef, useState } from "react";

import { likeMessage, unlikeMessage } from "../../shared/api/chat";
import { useAuth } from "../auth/AuthContext";

interface Props {
  messageId: number;
  liked: boolean; // liked_by_me from the server
  count: number; // like_count from the server
}

export default function LikeButton({ messageId, liked: serverLiked, count: serverCount }: Props) {
  const { requireSignIn } = useAuth();
  const [liked, setLiked] = useState(serverLiked);
  const [count, setCount] = useState(serverCount);
  // Counts clicks, so a slow failure of an old click cannot undo a newer one.
  const latestRequest = useRef(0);

  // When the server sends new values (the list reloaded), start from them again.
  // Done during render, as the React docs recommend, instead of in an effect.
  const [server, setServer] = useState({ serverLiked, serverCount });
  if (server.serverLiked !== serverLiked || server.serverCount !== serverCount) {
    setServer({ serverLiked, serverCount });
    setLiked(serverLiked);
    setCount(serverCount);
  }

  async function toggle() {
    if (!requireSignIn()) return;
    const nextLiked = !liked;
    const request = ++latestRequest.current;
    setLiked(nextLiked);
    setCount((current) => current + (nextLiked ? 1 : -1));
    try {
      await (nextLiked ? likeMessage(messageId) : unlikeMessage(messageId));
    } catch (error) {
      console.error("like failed", error);
      if (request === latestRequest.current) {
        setLiked(!nextLiked);
        setCount((current) => current + (nextLiked ? -1 : 1));
      }
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-pressed={liked}
      aria-label={`${liked ? "ביטול לייק" : "לייק"}, ${count}`}
    >
      <span aria-hidden="true">{liked ? "♥" : "♡"}</span> {count}
    </button>
  );
}