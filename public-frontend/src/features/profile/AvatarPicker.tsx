/** Pick one of the ready-made avatars. The choice shows at once and is saved in the background. */

import { useEffect, useRef, useState } from "react";

import { changeAvatar } from "../../shared/api/chat";
import { useIsDesktop } from "../../shared/browser/useIsDesktop";
import Avatar, { AVATAR_GROUPS, type AvatarGroup } from "../../shared/components/Avatar";
import { useAuth } from "../auth/AuthContext";
import styles from "./AvatarPicker.module.css";

// The heading above each group, in the order of AVATAR_GROUPS.
const GROUP_TITLES: Record<AvatarGroup["id"], string> = {
  emoji: "אימוג'י",
  scientists: "מדענים",
  moments: "רגעים מפורסמים",
  space: "חלל",
};

// How long the "saved" note stays after a save.
const SAVED_MS = 2000;

interface Props {
  current: string;
}

export default function AvatarPicker({ current }: Props) {
  const { updateUser } = useAuth();
  const isDesktop = useIsDesktop();
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  // Counts clicks, so a slow answer to an old click cannot undo a newer one.
  const latestRequest = useRef(0);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), SAVED_MS);
    return () => clearTimeout(timer);
  }, [saved]);

  async function pick(avatar: string) {
    if (avatar === current) return;
    const previous = current;
    const request = ++latestRequest.current;
    setFailed(false);
    setSaved(false);
    updateUser({ avatar }); // optimistic: the page and the header change right away
    try {
      await changeAvatar(avatar);
      if (request === latestRequest.current) setSaved(true);
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
      {/* The choice is saved without a button: this line says so for a moment. */}
      <p className={styles.status} role="status">
        {saved && (
          <>
            <span className={styles.check} aria-hidden="true" />
            נשמר
          </>
        )}
      </p>
      {AVATAR_GROUPS.map((group) => {
        const title = GROUP_TITLES[group.id];
        return (
          <section key={group.id} className={styles.group}>
            <h3 className={styles.title}>{title}</h3>
            <div className={styles.grid} role="group" aria-label={title}>
              {group.keys.map((avatar, index) => (
                <button
                  key={avatar}
                  type="button"
                  className={styles.option}
                  onClick={() => void pick(avatar)}
                  aria-pressed={avatar === current}
                  aria-label={`${title}, אווטאר ${index + 1} מתוך ${group.keys.length}`}
                >
                  {/* 44 on a phone, not 48: six in a row with the ring around one still fit a
                      narrow phone. Bigger on a desktop, where the grid has the whole left side. */}
                  <Avatar avatar={avatar} size={isDesktop ? 64 : 44} />
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {failed && (
        <p className={styles.error} role="alert">
          לא הצלחנו לשמור את האווטאר.
        </p>
      )}
    </div>
  );
}
