/** One committee announcement: date, a "pinned" mark, and whichever of title, image and text it has
    (each is optional, but a published one has at least one).
    Used by the announcements page and by the home page (which shows only the pinned one). */

import type { Announcement } from "../../shared/api/announcements";
import styles from "./AnnouncementCard.module.css";

// "13 באוק׳ 2026": announcements are read days later, so a real date says more than "3 days ago".
const dateFormat = new Intl.DateTimeFormat("he", { dateStyle: "medium" });

interface Props {
  announcement: Announcement;
  /** The title's heading level, so the page outline stays right (h2 on its page, h3 on home). */
  headingLevel?: 2 | 3;
  /** The home page preview: the whole text on a phone, at most a set number of lines on a computer. */
  short?: boolean;
  /** On a computer: the text beside the image instead of around it (phone: unchanged). */
  wideOnDesktop?: boolean;
}

export default function AnnouncementCard({
  announcement,
  headingLevel = 2,
  short = false,
  wideOnDesktop = false,
}: Props) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const titleId = `announcement-${announcement.id}`;
  const { image, title } = announcement;
  const date = dateFormat.format(new Date(announcement.published_at));

  return (
    <article
      className={[styles.card, announcement.pinned && styles.pinned, wideOnDesktop && styles.wide]
        .filter(Boolean)
        .join(" ")}
      // A screen reader names the card by its title; without one, by its date.
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : `הכרזה מ־${date}`}
    >
      <div className={styles.meta}>
        {announcement.pinned && <span className={styles.badge}>נעוץ</span>}
        <time dateTime={announcement.published_at}>{date}</time>
        {announcement.edited_at && <span className={styles.detail}>נערך</span>}
      </div>

      {title && (
        <Heading className={styles.title} id={titleId} dir="auto">
          {title}
        </Heading>
      )}

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
