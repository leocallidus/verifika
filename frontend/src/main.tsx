import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { useThemeSync } from "./theme/theme";
import { useAuth } from "./store/auth";
import { ToastHost } from "./components/ui/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

const client = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

import { useBranding } from "./store/branding";

function Boot() {
  useThemeSync();
  useEffect(() => {
    useAuth.getState().hydrate();
    useBranding.getState().loadBranding();
  }, []);
  return null;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <Boot />
          <App />
          <ToastHost />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
