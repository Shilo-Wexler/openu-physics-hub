/** /about: who runs the site, why, and who made it. Privacy and terms live on /privacy. */

import type { ReactNode } from "react";
import styles from "./AboutPage.module.css";

const OPENU_URL = "https://www.openu.ac.il/";
const STUDENT_UNION_URL = "https://studentop.org/";

/** Small monochrome marks that show where a person's link leads. */
function LinkedInIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="4" />
      <g fill="var(--color-bg)">
        <circle cx="7" cy="7" r="1.8" />
        <rect x="5.4" y="9.6" width="3.2" height="9.4" />
        <path d="M10.6 9.6h3v1.4c.5-.9 1.6-1.7 3.1-1.7 2.8 0 3.3 1.8 3.3 4.2V19h-3.1v-4.9c0-1.2-.1-2.3-1.5-2.3s-1.7 1-1.7 2.2V19h-3.1z" />
      </g>
    </svg>
  );
}

function GitLabIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 22.5 1.4 14.6 4.3 3.2l2.6 7.6h10.2l2.6-7.6 2.9 11.4z" />
    </svg>
  );
}

// Each site a person can link to: its icon, and the name shown in the desktop card.
const SITES = {
  linkedin: { Icon: LinkedInIcon, label: "LinkedIn" },
  gitlab: { Icon: GitLabIcon, label: "GitLab" },
};

interface Person {
  name: string;
  href: string;
  site: keyof typeof SITES;
}

// The team, each name linking to a profile they chose. New helpers join the credit line.
const TEAM = {
  shilo: { name: "Shilo Wexler", href: "https://www.linkedin.com/in/shilo-wexler", site: "linkedin" },
  yehuda: { name: "Yehuda Inbal", href: "https://gitlab.com/Yehuda-Inbal", site: "gitlab" },
  yoav: {
    name: "Yoav Wasserman",
    href: "https://www.linkedin.com/in/yoav-wasserman-6b2323297/",
    site: "linkedin",
  },
} satisfies Record<string, Person>;

// Who goes under each heading of the desktop card. Same people as the credit line.
const BUILT_BY: Person[] = [TEAM.shilo, TEAM.yehuda];
const DESIGNED_WITH: Person[] = [TEAM.yoav];

/** Another site: a new tab, and noopener so it cannot reach back into this one. */
function ExternalLink({
  href,
  className = styles.link,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/** A name inside the credit line (phone). */
function PersonLink({ person }: { person: Person }) {
  const { Icon } = SITES[person.site];
  return (
    <span className={styles.person}>
      <ExternalLink href={person.href}>
        <Icon />
        {person.name}
      </ExternalLink>
    </span>
  );
}

/** A group of names in the side card (desktop): each row is one link. */
function PeopleList({ title, people }: { title: string; people: Person[] }) {
  return (
    <>
      <h2 className={styles.sideTitle}>{title}</h2>
      <ul className={styles.sideList}>
        {people.map((person) => {
          const { Icon, label } = SITES[person.site];
          return (
            <li key={person.href}>
              <ExternalLink href={person.href} className={styles.personRow}>
                <span className={styles.personName}>{person.name}</span>
                <span className={styles.personSite}>
                  <Icon />
                  {label}
                </span>
              </ExternalLink>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default function AboutPage() {
  return (
    <div className={styles.layout}>
      <div className={styles.page}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>אודות</p>
          <h1 className={styles.title}>OpenUVoice</h1>
        </header>

        <section className={styles.section} aria-labelledby="about-who">
          <h2 className={styles.sectionTitle} id="about-who">
            מי אנחנו
          </h2>
          <p className={styles.text}>
            OpenUVoice הוא מקום אחד לסטודנטים לפיזיקה באוניברסיטה הפתוחה: לקרוא ולכתוב ביקורות על
            קורסים, לדבר בצ'אט, לעקוב אחרי עדכוני ועד הסטודנטים ולפנות אליו.
          </p>
          <p className={styles.text}>
            ועד הסטודנטים לפיזיקה הוא קבוצה של סטודנטים מתנדבים. מדי פעם אנחנו נפגשים עם צוותי ההוראה
            ומעלים בפניהם בעיות שסטודנטים מצביעים עליהן, והפניות שמגיעות דרך האתר עוזרות לנו לדעת מה
            להעלות.
          </p>
          <p className={styles.text}>
            האתר הוא מיזם עצמאי של ועד הסטודנטים, ואינו קשור רשמית ל
            <ExternalLink href={OPENU_URL}>אוניברסיטה הפתוחה</ExternalLink> או ל
            <ExternalLink href={STUDENT_UNION_URL}>אגודת הסטודנטים</ExternalLink>.
          </p>
        </section>

        {/* Phone: the credit line at the end. Hidden on desktop, where the side card shows it. */}
        <p className={styles.credit} dir="ltr">
          Built by <PersonLink person={TEAM.shilo} /> and <PersonLink person={TEAM.yehuda} />,
          designed together with <PersonLink person={TEAM.yoav} />.
        </p>
      </div>

      {/* Desktop: the same credit as a card on the left. Hidden on the phone. */}
      <aside className={styles.side} dir="ltr" lang="en" aria-label="Credits">
        <PeopleList title="Built by" people={BUILT_BY} />
        <PeopleList title="Designed together with" people={DESIGNED_WITH} />
      </aside>
    </div>
  );
}
