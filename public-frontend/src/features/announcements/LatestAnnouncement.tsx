/** The home page's announcement: the one the committee pinned, cut short, with a link to all
    announcements. Shows nothing when none is pinned (or until it has loaded). */

import { useEffect, useState } from "react";
import { Link } from "react-router";

import { getPinnedAnnouncement, type Announcement } from "../../shared/api/announcements";
import { isAbort } from "../../shared/api/client";
import AnnouncementCard from "./AnnouncementCard";
import styles from "./LatestAnnouncement.module.css";

export default function LatestAnnouncement() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getPinnedAnnouncement(controller.signal)
      .then(setAnnouncement)
      .catch((error: unknown) => {
        if (isAbort(error)) return;
        // The home page works without it: a failure only means the section stays hidden.
        console.error(error);
      });
    return () => controller.abort();
  }, []);

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
