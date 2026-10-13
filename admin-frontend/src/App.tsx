import { Link, Navigate, Route, Routes } from "react-router";

import AdminPage from "./pages/admin/AdminPage";

/** The admin console only. Students use public-frontend. */
export default function App() {
  return (
    <>
      <header className="site-header">
        <nav>
          <Link to="/" className="brand">
            ועדת הסטודנטים לפיזיקה · קונסולת ניהול
          </Link>
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
