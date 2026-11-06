import styles from "./Avatar.module.css";

/** How a group's pictures are shown: the background behind them and how much room they take. */
type Look = "emoji" | "portrait" | "drawing";

export interface AvatarGroup {
  id: "emoji" | "scientists" | "moments" | "space";
  look: Look;
  keys: readonly string[];
}

/**
 * The avatars a user can pick from, in groups and in a fixed order (a key's place in its group
 * sets its background). Keys match AVATARS in chat-backend/app/services/users.py; each has
 * shared/assets/avatars/<key>.svg.
 * The emoji are Microsoft Fluent Emoji: their license stays in public/avatars/LICENSE, served
 * with the site. The scientists are traced from public-domain portraits; the moments and space
 * pictures were drawn for this site.
 */
export const AVATAR_GROUPS: readonly AvatarGroup[] = [
  {
    id: "emoji",
    look: "emoji",
    keys: [
      "atom", "telescope", "microscope", "rocket", "satellite", "saturn",
      "test-tube", "dna", "magnet", "bulb", "comet", "galaxy",
      "flask", "sun", "moon", "earth", "lightning", "snowflake",
      "rainbow", "volcano", "owl", "fox", "octopus", "robot",
    ],
  },
  {
    id: "scientists",
    look: "portrait",
    keys: [
      "sci-newton", "sci-galileo", "sci-faraday", "sci-maxwell",
      "sci-kepler", "sci-copernicus", "sci-huygens", "sci-pascal",
      "sci-euler", "sci-gauss", "sci-volta", "sci-ampere",
      "sci-kelvin", "sci-hertz", "sci-chatelet", "sci-somerville",
    ],
  },
  {
    id: "moments",
    look: "drawing",
    keys: [
      "moment-apple", "moment-cat", "moment-pisa", "moment-cradle",
      "moment-foucault", "moment-slits", "moment-demon", "moment-kite",
      "moment-prism", "moment-telescope", "moment-doppler", "moment-magnet",
      "moment-fma",
    ],
  },
  {
    id: "space",
    look: "drawing",
    keys: [
      "space-pulsar", "space-saturn", "space-blackhole", "space-galaxy",
      "space-comet", "space-supernova", "space-earth", "space-jupiter",
    ],
  },
];

/** Every key, in group order. */
export const AVATARS: readonly string[] = AVATAR_GROUPS.flatMap((group) => group.keys);

// Each key's look and its place in its group.
const PLACES = new Map<string, { look: Look; index: number }>(
  AVATAR_GROUPS.flatMap((group) =>
    group.keys.map((key, index) => [key, { look: group.look, index }] as const),
  ),
);

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

// Matches --avatar-bg-1 ... --avatar-bg-6 in global.css (emoji)
// and --pastel-1 ... --pastel-6 in Avatar.module.css (drawings).
const BACKGROUNDS = 6;

function backgroundColor(look: Look, index: number): string | undefined {
  const number = (index % BACKGROUNDS) + 1;
  if (look === "emoji") return `var(--avatar-bg-${number})`;
  if (look === "drawing") return `var(--pastel-${number})`;
  return undefined; // a portrait brings its own white circle
}

interface Props {
  /** An AVATARS key, or null for a deleted message. */
  avatar: string | null;
  size?: number;
}

export default function Avatar({ avatar, size = 36 }: Props) {
  const place = avatar === null ? undefined : PLACES.get(avatar);
  const url = avatar !== null && place !== undefined ? pictureUrl(avatar) : undefined;
  // An unknown key (e.g. an avatar removed in a later version) or a deleted message: empty circle.
  if (place === undefined || url === undefined) {
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
      className={place.look === "emoji" ? styles.avatar : `${styles.avatar} ${styles.full}`}
      style={{
        width: size,
        height: size,
        backgroundColor: backgroundColor(place.look, place.index),
        backgroundImage: `url("${url}")`,
      }}
      aria-hidden="true"
    />
  );
}
