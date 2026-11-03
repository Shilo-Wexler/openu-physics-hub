import styles from "./Avatar.module.css";

/**
 * The avatars a user can pick from, in a fixed order (the order sets each one's background).
 * Keys match AVATARS in chat-backend/app/services/users.py; each has shared/assets/avatars/<key>.svg.
 * Their license stays in public/avatars/LICENSE, served with the site.
 */
export const AVATARS = [
  "atom", "telescope", "microscope", "rocket", "satellite", "saturn",
  "test-tube", "dna", "magnet", "bulb", "comet", "galaxy",
  "flask", "sun", "moon", "earth", "lightning", "snowflake",
  "rainbow", "volcano", "owl", "fox", "octopus", "robot",
] as const;

// The pictures go through Vite like every other asset: each URL carries a content hash, so the
// browser keeps a picture for a year (nginx /assets/) and a changed picture gets a new URL.
const PICTURES = import.meta.glob<string>("../assets/avatars/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});

function pictureUrl(key: string): string | undefined {
  return PICTURES[`../assets/avatars/${key}.svg`];
}

// Matches the --avatar-bg-1 ... --avatar-bg-6 colors in global.css.
const BACKGROUNDS = 6;

interface Props {
  /** An AVATARS key, or null for a deleted message. */
  avatar: string | null;
  size?: number;
}

export default function Avatar({ avatar, size = 36 }: Props) {
  const index = avatar === null ? -1 : AVATARS.indexOf(avatar as (typeof AVATARS)[number]);
    const url = avatar !== null && index >= 0 ? pictureUrl(avatar) : undefined;
  // An unknown key (e.g. an avatar removed in a later version) or a deleted message: empty circle.
  if (url === undefined) {
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
        backgroundImage: `url("${url}")`,
      }}
      aria-hidden="true"
    />
  );
}