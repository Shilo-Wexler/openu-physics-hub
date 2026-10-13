import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

// Self-hosted Heebo (variable weights): bundled by Vite and served from our
// own domain, so no request goes to a third-party font server.
import "@fontsource-variable/heebo";

import App from "./App";
import { AuthProvider } from "./features/auth/AuthContext";
import { trackKeyboard } from "./shared/browser/keyboard";
import "./shared/styles/global.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("index.html is missing the #root element");
}

// Before the first render, so the CSS knows about the keyboard from the start.
trackKeyboard();

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);