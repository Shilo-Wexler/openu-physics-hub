/** The home page's announcement: the one the committee pinned, cut short, with a link to all
    announcements. Shows nothing when none is pinned (or until it has loaded). */

import { useEffect, useState } from "react";
import { Link } from "react-router";

import { getPinnedAnnouncement, type Announcement } from "../../shared/api/announcements";
import AnnouncementCard from "./AnnouncementCard";
import styles from "./LatestAnnouncement.module.css";

interface Props {
  /** Called once a pinned announcement is there to show, so the page can make room for it. */
  onShow?: () => void;
}

export default function LatestAnnouncement({ onShow }: Props) {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getPinnedAnnouncement(controller.signal)
      .then(setAnnouncement)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // The home page works without it: a failure only means the section stays hidden.
        console.error(error);
      });
    return () => controller.abort();
  }, []);

  // Tells the page once there is something to show. Calling it again is harmless.
  useEffect(() => {
    if (announcement) onShow?.();
  }, [announcement, onShow]);

  if (!announcement) return null;

  return (
    <section className={styles.section} aria-labelledby="latest-announcement">
      <h2 className={styles.label} id="latest-announcement">
        מהוועדה
      </h2>
      <AnnouncementCard announcement={announcement} headingLevel={3} short />
      <Link to="/announcements" className={styles.all}>
        לכל ההכרזות
      </Link>
    </section>
  );
}
