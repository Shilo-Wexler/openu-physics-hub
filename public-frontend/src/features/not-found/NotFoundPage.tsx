import { Link } from "react-router";

/** Any address the site does not know (the "*" route in App.tsx). */
export default function NotFoundPage() {
  return (
    <>
      <h1>הדף לא נמצא</h1>
      <p>אולי הקישור ישן, או שהייתה טעות בכתובת.</p>
      <p>
        <Link to="/">חזרה לדף הבית</Link>
      </p>
    </>
  );
}
