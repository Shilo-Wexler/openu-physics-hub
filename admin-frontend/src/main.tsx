import "@fontsource-variable/heebo";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import App from "./App";
import "./shared/styles/global.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("index.html is missing the #root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
