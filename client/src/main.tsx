import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker for PWA with autoUpdate
registerSW({ immediate: true });

import { AuthProvider } from "@/lib/auth-context";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
