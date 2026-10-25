import { Route, Routes } from "react-router";

import ConsoleShell from "./layout/ConsoleShell";

/** The admin console only. Students use public-frontend. ConsoleShell owns the frame and the section routes. */
export default function App() {
  return (
    <Routes>
      <Route path="/*" element={<ConsoleShell />} />
    </Routes>
  );
}
