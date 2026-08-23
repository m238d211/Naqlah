import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import "./styles.css";
import { MiniApp } from "./mini-app";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <MiniApp />
      <Toaster position="top-center" dir="rtl" />
    </QueryClientProvider>
  </React.StrictMode>,
);
