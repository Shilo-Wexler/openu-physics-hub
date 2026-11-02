/** Pick one of the ready-made avatars. The choice shows at once and is saved in the background. */

import { useRef, useState } from "react";

import { changeAvatar } from "../../shared/api/chat";
import { useIsDesktop } from "../../shared/browser/useIsDesktop";
import Avatar, { AVATARS } from "../../shared/components/Avatar";
import { useAuth } from "../auth/AuthContext";
import styles from "./AvatarPicker.module.css";

interface Props {
  current: string;
}

export default function AvatarPicker({ current }: Props) {
  const { updateUser } = useAuth();
  const isDesktop = useIsDesktop();
  const [failed, setFailed] = useState(false);
  // Counts clicks, so a slow answer to an old click cannot undo a newer one.
  const latestRequest = useRef(0);

  async function pick(avatar: string) {
    if (avatar === current) return;
    const previous = current;
    const request = ++latestRequest.current;
    setFailed(false);
    updateUser({ avatar }); // optimistic: the page and the header change right away
    try {
      await changeAvatar(avatar);
    } catch (error) {
      console.error("avatar change failed", error);
      if (request === latestRequest.current) {
        updateUser({ avatar: previous });
        setFailed(true);
      }
    }
  }

  return (
    <div>
      <div className={styles.grid} role="group" aria-label="בחירת אווטאר">
        {AVATARS.map((avatar, index) => (
          <button
            key={avatar}
            type="button"
            className={styles.option}
            onClick={() => void pick(avatar)}
            aria-pressed={avatar === current}
            aria-label={`אווטאר ${index + 1} מתוך ${AVATARS.length}`}
          >
            {/* 44 on a phone, not 48: six in a row with the ring around one still fit a narrow
                phone. Bigger on a desktop, where the grid has the whole left side. */}
            <Avatar avatar={avatar} size={isDesktop ? 64 : 44} />
          </button>
        ))}
      </div>
      {failed && (
        <p className={styles.error} role="alert">
          לא הצלחנו לשמור את האווטאר.
        </p>
      )}
    </div>
  );
}
