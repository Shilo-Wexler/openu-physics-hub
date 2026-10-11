import styles from "./Avatar.module.css";

/**
 * The avatars a user can pick from, in a fixed order (the order sets each one's background).
 * Keys match AVATARS in chat-backend/app/services/users.py; each has public/avatars/<key>.svg.
 */
export const AVATARS = [
  "atom", "telescope", "microscope", "rocket", "satellite", "saturn",
  "test-tube", "dna", "magnet", "bulb", "comet", "galaxy",
  "flask", "sun", "moon", "earth", "lightning", "snowflake",
  "rainbow", "volcano", "owl", "fox", "octopus", "robot",
] as const;

// Matches the --avatar-bg-1 ... --avatar-bg-6 colors in global.css.
const BACKGROUNDS = 6;

interface Props {
  /** An AVATARS key, or null for a deleted message. */
  avatar: string | null;
  size?: number;
}

export default function Avatar({ avatar, size = 36 }: Props) {
  const index = avatar === null ? -1 : AVATARS.indexOf(avatar as (typeof AVATARS)[number]);
  // An unknown key (e.g. an avatar removed in a later version) or a deleted message: empty circle.
  if (index < 0) {
    return (
      <span
        className={styles.avatar}
        style={{ width: size, height: size, background: "var(--color-border)" }}
        aria-hidden="true"
      />
    );
  }
  return (
    <span
      className={styles.avatar}
      style={{
        width: size,
        height: size,
        backgroundColor: `var(--avatar-bg-${(index % BACKGROUNDS) + 1})`,
        backgroundImage: `url(/avatars/${AVATARS[index]}.svg)`,
      }}
      aria-hidden="true"
    />
  );
}