/** Heart and count. A click likes, a second click unlikes; the change shows at once. */

import { useRef, useState } from "react";

import { likeMessage, unlikeMessage } from "../../shared/api/chat";
import { useAuth } from "../auth/AuthContext";
import styles from "./LikeButton.module.css";

const HEART_PATH = "M12 20s-7.5-4.6-9.3-9.4A5 5 0 0 1 12 6.2a5 5 0 0 1 9.3 4.4C19.5 15.4 12 20 12 20z";

interface Props {
  messageId: number;
  liked: boolean; // liked_by_me from the server
  count: number; // like_count from the server
}

export default function LikeButton({ messageId, liked: serverLiked, count: serverCount }: Props) {
  const { requireSignIn } = useAuth();
  const [liked, setLiked] = useState(serverLiked);
  const [count, setCount] = useState(serverCount);
  // True only right after the reader liked, so the heart pops on a click and not on load.
  const [popping, setPopping] = useState(false);
  // The state of the reader's last click, and whether a request is on its way.
  // One request at a time: two at once could reach the server in the other order
  // and leave it liked while the heart shows unliked.
  const wanted = useRef(serverLiked);
  const sending = useRef(false);

  // When the server sends new values (the list reloaded), start from them again.
  // Done during render, as the React docs recommend, instead of in an effect.
  const [server, setServer] = useState({ serverLiked, serverCount });
  if (server.serverLiked !== serverLiked || server.serverCount !== serverCount) {
    setServer({ serverLiked, serverCount });
    setLiked(serverLiked);
    setCount(serverCount);
  }

  function toggle() {
    if (!requireSignIn()) return;
    const nextLiked = !liked;
    setLiked(nextLiked);
    setPopping(nextLiked);
    setCount((current) => current + (nextLiked ? 1 : -1));
    wanted.current = nextLiked;
    if (!sending.current) void send();
  }

  /** Sends the last click's state; if the reader clicked again meanwhile, sends that one next.
   * Many quick clicks cost at most two requests, and the server ends on the last click. */
  async function send() {
    sending.current = true;
    let target = wanted.current;
    do {
      target = wanted.current;
      try {
        await (target ? likeMessage(messageId) : unlikeMessage(messageId));
      } catch (error) {
        console.error("like failed", error);
        // No newer click: show the state from before this one. A newer click is sent next.
        if (wanted.current === target) {
          setLiked(!target);
          setCount((current) => current + (target ? -1 : 1));
          break;
        }
      }
    } while (wanted.current !== target);
    sending.current = false;
  }

  return (
    <button
      type="button"
      className={[styles.button, liked && styles.liked, popping && styles.pop]
        .filter(Boolean)
        .join(" ")}
      onClick={toggle}
      onAnimationEnd={() => setPopping(false)}
      aria-pressed={liked}
      aria-label={`${liked ? "ביטול לייק" : "לייק"}, ${count}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={HEART_PATH} />
      </svg>
      {/* No likes yet: just the heart, as in most apps, instead of a lonely 0. */}
      {count > 0 && (
        <span className={styles.count} aria-hidden="true">
          {count}
        </span>
      )}
    </button>
  );
}
