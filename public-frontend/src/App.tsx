import { NavLink, Route, Routes } from "react-router";

// Temporary stand-in until each page gets its own file in src/pages/.
function Placeholder({ title }: { title: string }) {
  return <h1>{title}</h1>;
}

export default function App() {
  return (
    <>
      <header>
        <nav>
          <NavLink to="/" end>
            ראשי
          </NavLink>
          <NavLink to="/courses">קורסים</NavLink>
          <NavLink to="/about">אודות</NavLink>
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Placeholder title="דף הבית" />} />
          <Route path="/courses" element={<Placeholder title="קורסים" />} />
          <Route path="/courses/:courseId" element={<Placeholder title="צ'אט הקורס" />} />
          <Route path="/about" element={<Placeholder title="אודות" />} />
          <Route path="*" element={<Placeholder title="הדף לא נמצא" />} />
        </Routes>
      </main>
    </>
  );
}