/** /privacy: terms of use, privacy and cookies. Shares the about page's look. */

import { useEffect, useState, type MouseEvent } from "react";
import styles from "./AboutPage.module.css";

const CONTACT_EMAIL = "contact@openuvoice.com";
// Change together with the text whenever the terms change.
const LAST_UPDATED = "נובמבר 2026";

// The page's sections, in order. Titles show both above each section and in the side list.
const SECTIONS = {
  operator: { id: "privacy-operator", title: "מי מפעיל את האתר" },
  terms: { id: "privacy-terms", title: "תנאי שימוש" },
  data: { id: "privacy-data", title: "פרטיות" },
  cookies: { id: "privacy-cookies", title: "עוגיות" },
};
const SECTION_LIST = Object.values(SECTIONS);

// A section counts as "being read" once its top passes this line (px from the window top):
// under the 64px sticky header, with some room.
const READING_LINE = 120;

/** The id of the section being read now: the last one whose top passed the reading line. */
function useCurrentSection(): string {
  const [current, setCurrent] = useState(SECTION_LIST[0]?.id ?? "");

  useEffect(() => {
    let frame = 0;

    function update() {
      frame = 0;
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      // At the very bottom the last sections may never reach the line, so the last one wins.
      if (atBottom) {
        setCurrent(SECTION_LIST[SECTION_LIST.length - 1]?.id ?? "");
        return;
      }
      let found = SECTION_LIST[0]?.id ?? "";
      for (const { id } of SECTION_LIST) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= READING_LINE) found = id;
      }
      setCurrent(found);
    }

    // At most one check per frame, however fast the page scrolls.
    function onScroll() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return current;
}

/** Scrolls to a section without adding a history entry; smooth unless the user asked for less motion. */
function jumpTo(event: MouseEvent<HTMLAnchorElement>, id: string) {
  event.preventDefault();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

export default function PrivacyPage() {
  const current = useCurrentSection();

  return (
    <div className={styles.layout}>
      <div className={styles.page}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>OpenUVoice</p>
          <h1 className={styles.title}>פרטיות ותנאי שימוש</h1>
          <p className={styles.updated}>עודכן לאחרונה: {LAST_UPDATED}</p>
        </header>

        <section className={styles.section} aria-labelledby={SECTIONS.operator.id}>
          <h2 className={styles.sectionTitle} id={SECTIONS.operator.id}>
            {SECTIONS.operator.title}
          </h2>
          <p className={styles.text}>
            OpenUVoice הוא מיזם התנדבותי של סטודנטים לפיזיקה באוניברסיטה הפתוחה, ואינו קשור רשמית
            לאוניברסיטה או לאגודת הסטודנטים. לשאלות על האתר:{" "}
            <a className={styles.link} href={`mailto:${CONTACT_EMAIL}`} dir="ltr">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>

        <section className={styles.section} aria-labelledby={SECTIONS.terms.id}>
          <h2 className={styles.sectionTitle} id={SECTIONS.terms.id}>
            {SECTIONS.terms.title}
          </h2>
          <p className={styles.text}>
            <strong>השימוש באתר.</strong> השימוש באתר כפוף לתנאים שבעמוד הזה. אנחנו עושים כמיטב
            יכולתנו שהאתר יעבוד ושהמידע בו יהיה נכון, אבל לא מתחייבים לכך.
          </p>
          <p className={styles.text}>
            <strong>התוכן באתר.</strong> ביקורות, דירוגים והודעות נכתבים על ידי המשתמשים, ומשקפים את
            דעת הכותבים בלבד, לא את עמדת הוועד או מפעילי האתר. המידע באתר לא מחליף מידע רשמי
            מהאוניברסיטה הפתוחה.
          </p>
          <p className={styles.text}>
            <strong>כללי כתיבה.</strong> אסור לפרסם באתר:
          </p>
          <ul className={styles.list}>
            <li>לשון הרע, השמצה או פגיעה אישית.</li>
            <li>פרטים מזהים או אישיים של אחרים (טלפון, מייל, כתובת וכו').</li>
            <li>הטרדה, איומים, גזענות או הסתה.</li>
            <li>תוכן שמפר זכויות יוצרים.</li>
            <li>פרסומות וספאם.</li>
          </ul>
          <p className={styles.text}>
            <strong>אחריות הכותבים.</strong> המשתמשים אחראים לתוכן שהם מפרסמים.
          </p>
          <p className={styles.text}>
            <strong>הסרת תוכן וחסימה.</strong> אנחנו רשאים להסיר תוכן ולחסום משתמשים לפי שיקול דעתנו
            ובלי הודעה מראש. כדי שנדע על תוכן שמפר את הכללים, ליד כל הודעה יש כפתור דיווח.
          </p>
          <p className={styles.text}>
            <strong>הגבלת אחריות.</strong> מפעילי האתר לא יישאו באחריות לנזק שנגרם משימוש באתר,
            מהסתמכות על התוכן בו, או מתוכן שפרסמו משתמשים.
          </p>
        </section>

        <section className={styles.section} aria-labelledby={SECTIONS.data.id}>
          <h2 className={styles.sectionTitle} id={SECTIONS.data.id}>
            {SECTIONS.data.title}
          </h2>
          <p className={styles.text}>
            <strong>מה אנחנו שומרים.</strong> ההתחברות היא עם Google. מ-Google אנחנו שומרים רק מזהה
            מספרי שמאפשר לזהות אותך בכניסה הבאה. את השם, המייל והתמונה מחשבון Google אנחנו לא
            שומרים. באתר נשמרים הכינוי והאווטאר שבחרת, ההודעות, הדירוגים, הלייקים והדיווחים שלך.
          </p>
          <p className={styles.text}>
            <strong>פניות לוועד.</strong> פנייה אנונימית נשמרת בלי שום פרט מזהה. אם בחרת להשאיר פרטי
            קשר (טלפון או מייל), הם נשמרים עם הפנייה, משמשים רק כדי לחזור אליך בעניין הפנייה, וגלויים
            רק לצוות הוועד.
          </p>
          <p className={styles.text}>
            <strong>שירותים חיצוניים.</strong> האתר עובר דרך Cloudflare, שמגן עליו מפני התקפות ורושם
            לשם כך מידע טכני כמו כתובת IP. ההתחברות עוברת דרך Google, לפי מדיניות הפרטיות של Google.
            אנחנו לא מוכרים מידע.
          </p>
          <p className={styles.text}>
            <strong>שינוי ומחיקה.</strong> את הכינוי והאווטאר אפשר לשנות בכל זמן בעמוד הפרופיל, ואת
            ההודעות שלך אפשר למחוק.
          </p>
        </section>

        <section className={styles.section} aria-labelledby={SECTIONS.cookies.id}>
          <h2 className={styles.sectionTitle} id={SECTIONS.cookies.id}>
            {SECTIONS.cookies.title}
          </h2>
          <p className={styles.text}>
            האתר משתמש רק בעוגיות הכרחיות: עוגייה שמשאירה אותך מחובר/ת, ועוגיות אבטחה של Google ושל
            Cloudflare בזמן ההתחברות ולהגנה על האתר. לכן אין באתר הודעה שמבקשת הסכמה לעוגיות.
          </p>
        </section>
      </div>

      {/* Desktop: the list of sections, kept in view. Hidden on the phone. */}
      <nav className={styles.side} aria-label="בעמוד הזה">
        <p className={styles.sideTitle}>בעמוד הזה</p>
        <ol className={styles.sideList}>
          {SECTION_LIST.map(({ id, title }) => (
            <li key={id}>
              <a
                className={id === current ? `${styles.tocLink} ${styles.tocCurrent}` : styles.tocLink}
                href={`#${id}`}
                aria-current={id === current ? "location" : undefined}
                onClick={(event) => jumpTo(event, id)}
              >
                {title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
