import { Route, Routes } from "react-router";

import AdminPage from "./pages/admin/AdminPage";

/** The admin console only. Students use public-frontend. AdminPage owns the frame and the section routes. */
export default function App() {
  return (
    <Routes>
      <Route path="/*" element={<AdminPage />} />
    </Routes>
  );
}
