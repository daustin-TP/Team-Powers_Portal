import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import CelebrationApp from "./celebrations/App";
import "./styles.css";

const celebrationsHost = window.location.hostname === "celebrations.powerspizza.com" || window.location.pathname.startsWith("/celebrations");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {celebrationsHost ? <CelebrationApp /> : <App />}
  </StrictMode>,
);

