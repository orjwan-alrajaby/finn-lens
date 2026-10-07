import React from "react";
import ReactDOM from "react-dom/client";

import "@/assets/tailwind.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { requestCloseDrawer } from "@/lib/chats/bridge";
import { App } from "./App";

const rootElement = document.getElementById("root");

if (!rootElement) throw new Error("Root element not found");

ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
        <ErrorBoundary recover={{ label: "Close", run: () => void requestCloseDrawer() }}>
            <App />
        </ErrorBoundary>
    </React.StrictMode>,
);
