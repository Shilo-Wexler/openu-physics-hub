import { Link } from "react-router";

import { GENERAL_COURSE_ID } from "../../shared/api/chat";
import { coursePath } from "./share";

/** /chat: where the reader picks the general chat or the course chats. */
export default function ChatHubPage() {
  return (
    <>
      <h1>צ'אט</h1>
      {/* Plain links for now; the cards get their look in the design stage. */}
      <nav aria-label="בחירת צ'אט">
        <ul>
          <li>
            <Link to={coursePath(GENERAL_COURSE_ID)}>
              <h2>צ'אט כללי</h2>
              <p>שיחה פתוחה על הכל: לימודים, מנהלה, שאלות כלליות.</p>
            </Link>
          </li>
          <li>
            <Link to="/courses">
              <h2>צ'אט קורסים</h2>
              <p>ביקורות ודירוגים לכל קורס. מחפשים לפי שם או מספר.</p>
            </Link>
          </li>
        </ul>
      </nav>
    </>
  );
}
