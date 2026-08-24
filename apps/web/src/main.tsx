import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import "./styles.css";
import { WebApp } from "./web-app";
import { TransferActivity } from "./activity";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <WebApp />
      <TransferActivity />
      <Toaster position="top-center" dir="rtl" />
    </QueryClientProvider>
  </React.StrictMode>,
);
