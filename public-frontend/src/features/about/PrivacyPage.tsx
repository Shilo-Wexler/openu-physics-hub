/** /privacy: terms of use, privacy and cookies. Shares the about page's look. */

import styles from "./AboutPage.module.css";

const CONTACT_EMAIL = "contact@openuvoice.com";
// Change together with the text whenever the terms change.
const LAST_UPDATED = "אוקטובר 2026";

export default function PrivacyPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>OpenUVoice</p>
        <h1 className={styles.title}>פרטיות ותנאי שימוש</h1>
        <p className={styles.updated}>עודכן לאחרונה: {LAST_UPDATED}</p>
      </header>

      <section className={styles.section} aria-labelledby="privacy-operator">
        <h2 className={styles.sectionTitle} id="privacy-operator">
          מי מפעיל את האתר
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

      <section className={styles.section} aria-labelledby="privacy-terms">
        <h2 className={styles.sectionTitle} id="privacy-terms">
          תנאי שימוש
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

      <section className={styles.section} aria-labelledby="privacy-data">
        <h2 className={styles.sectionTitle} id="privacy-data">
          פרטיות
        </h2>
        <p className={styles.text}>
          <strong>מה אנחנו שומרים.</strong> ההתחברות היא עם Google. מ-Google אנחנו שומרים רק מזהה
          מספרי שמאפשר לזהות אותך בכניסה הבאה. את השם, המייל והתמונה מחשבון Google אנחנו לא שומרים.
          באתר נשמרים הכינוי והאווטאר שבחרת, ההודעות, הדירוגים, הלייקים והדיווחים שלך.
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

      <section className={styles.section} aria-labelledby="privacy-cookies">
        <h2 className={styles.sectionTitle} id="privacy-cookies">
          עוגיות
        </h2>
        <p className={styles.text}>
          האתר משתמש רק בעוגיות הכרחיות: עוגייה שמשאירה אותך מחובר/ת, ועוגיות אבטחה של Google ושל
          Cloudflare בזמן ההתחברות ולהגנה על האתר. לכן אין באתר הודעה שמבקשת הסכמה לעוגיות.
        </p>
      </section>
    </div>
  );
}
