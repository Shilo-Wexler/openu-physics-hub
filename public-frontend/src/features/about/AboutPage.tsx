/** /about: who runs the site and why. The text is a draft until the final wording pass. */

import styles from "./AboutPage.module.css";

// The official bodies, for readers who meant to reach them. Plain text links, no logos,
// so nothing suggests the site is theirs.
const OFFICIAL_LINKS = [
  { href: "https://www.openu.ac.il/", label: "האוניברסיטה הפתוחה" },
  { href: "https://studentop.org/", label: "אגודת הסטודנטים" },
];

export default function AboutPage() {
  return (
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
          OpenUVoice הוא האתר של ועדת הסטודנטים של המחלקה לפיזיקה באוניברסיטה הפתוחה. המטרה:
          מקום אחד לשתף חוויות מהקורסים, לעזור לבחור קורסים, ולהעביר אלינו בקשות ותלונות.
        </p>
        <p className={styles.text}>
          חברי הוועדה הם סטודנטים מתנדבים. מדי פעם אנחנו נפגשים עם צוותי ההוראה כדי להציף בעיות
          וטענות שעולות מהסטודנטים, וכאן הפניות שלכם נכנסות לתמונה.
        </p>
        <p className={styles.text}>
          האתר עצמאי. הוא לא האתר הרשמי של האוניברסיטה הפתוחה או של אגודת הסטודנטים.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="about-privacy">
        <h2 className={styles.sectionTitle} id="about-privacy">
          פרטיות
        </h2>
        <p className={styles.text}>
          ההתחברות היא עם Google, אבל אנחנו לא שומרים את השם, המייל או התמונה שלכם. באתר מופיעים
          רק הכינוי והאווטאר שבחרתם.
        </p>
      </section>

      <p className={styles.official}>
        לפניות רשמיות:{" "}
        {OFFICIAL_LINKS.map((link, index) => (
          <span key={link.href}>
            {index > 0 && " · "}
            {/* Another site: a new tab, and noopener so it cannot reach back into this one. */}
            <a className={styles.link} href={link.href} target="_blank" rel="noopener noreferrer">
              {link.label}
            </a>
          </span>
        ))}
      </p>
    </div>
  );
}
