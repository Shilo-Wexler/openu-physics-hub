/** One committee announcement: title, date, a "pinned" mark, an optional image and its text.
    Used by the announcements page and by the home page (which shows only the pinned one, cut short). */

import type { Announcement } from "../../shared/api/announcements";
import styles from "./AnnouncementCard.module.css";

// "13 באוק׳ 2026": announcements are read days later, so a real date says more than "3 days ago".
const dateFormat = new Intl.DateTimeFormat("he", { dateStyle: "medium" });

interface Props {
  announcement: Announcement;
  /** The title's heading level, so the page outline stays right (h2 on its page, h3 on home). */
  headingLevel?: 2 | 3;
  /** Cuts the text to a few lines, for a preview. */
  short?: boolean;
}

export default function AnnouncementCard({ announcement, headingLevel = 2, short = false }: Props) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const titleId = `announcement-${announcement.id}`;
  const { image } = announcement;

  return (
    <article
      className={[styles.card, announcement.pinned && styles.pinned].filter(Boolean).join(" ")}
      aria-labelledby={titleId}
    >
      <div className={styles.meta}>
        {announcement.pinned && <span className={styles.badge}>נעוץ</span>}
        <time dateTime={announcement.published_at}>
          {dateFormat.format(new Date(announcement.published_at))}
        </time>
        {announcement.edited_at && <span className={styles.detail}>נערך</span>}
      </div>

      <Heading className={styles.title} id={titleId} dir="auto">
        {announcement.title}
      </Heading>

      {image && (
        // Tapping opens the full image in a new tab, where it can be zoomed and saved.
        <a className={styles.imageLink} href={image.url} target="_blank" rel="noopener noreferrer">
          {/* width and height keep the image's space while it loads, so the page does not jump.
              lazy: an image far down the page loads only when the reader gets near it. */}
          <img
            className={styles.image}
            src={image.url}
            width={image.width}
            height={image.height}
            alt={image.alt}
            loading="lazy"
            decoding="async"
          />
        </a>
      )}

      {/* Plain text, never HTML: React shows it as is, whatever it contains. */}
      {announcement.body && (
        <p className={[styles.body, short && styles.short].filter(Boolean).join(" ")} dir="auto">
          {announcement.body}
        </p>
      )}
    </article>
  );
}
