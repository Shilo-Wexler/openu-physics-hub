/** Pick one of the ready-made avatars. The choice shows at once and is saved in the background. */

import { useRef, useState } from "react";

import { changeAvatar } from "../../shared/api/chat";
import Avatar, { AVATARS } from "../../shared/components/Avatar";
import { useAuth } from "../auth/AuthContext";

interface Props {
  current: string;
}

export default function AvatarPicker({ current }: Props) {
  const { updateUser } = useAuth();
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
      <div role="group" aria-label="בחירת אווטאר">
        {AVATARS.map((avatar) => (
          <button
            key={avatar}
            type="button"
            onClick={() => void pick(avatar)}
            aria-pressed={avatar === current}
            aria-label={avatar}
          >
            <Avatar avatar={avatar} size={48} />
          </button>
        ))}
      </div>
      {failed && <p role="alert">שמירת האווטאר נכשלה, נסו שוב</p>}
    </div>
  );
}