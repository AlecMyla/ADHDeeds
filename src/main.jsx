import React from "react";
import { createRoot } from "react-dom/client";
import ADHDeedsApp from "./ADHDeedsApp.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ADHDeedsApp />
  </React.StrictMode>
);
