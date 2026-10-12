import { Link } from "react-router";

// The areas of the site, one card each. A new area gets a card when it is built.
const AREAS = [
  { to: "/chat", title: "צ'אט", text: "צ'אט כללי, וביקורות ודירוגים לכל קורס." },
  { to: "/about", title: "אודות", text: "מי אנחנו ולמה הקמנו את האתר." },
];

/** /: the site's front page, with a card for each area. */
export default function HomePage() {
  return (
    <>
      <h1>OpenUVoice</h1>
      <p>סטודנטים לפיזיקה באו״פ.</p>
      <p>
        <small>לא אתר רשמי של האוניברסיטה הפתוחה.</small>
      </p>

      {/* Plain links for now; the cards get their look in the design stage. */}
      <nav aria-label="אזורי האתר">
        <ul>
          {AREAS.map((area) => (
            <li key={area.to}>
              <Link to={area.to}>
                <h2>{area.title}</h2>
                <p>{area.text}</p>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
