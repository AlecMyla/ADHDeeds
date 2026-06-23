import React from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import ADHDeedsApp from "./ADHDeedsApp.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ADHDeedsApp />
    <Analytics />
  </React.StrictMode>
);
