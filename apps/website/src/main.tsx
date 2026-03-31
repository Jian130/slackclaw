import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.js";
import "./styles/index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Expected #root element for website app");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
