import React from "react";
import ReactDOM from "react-dom/client";

import "@/assets/tailwind.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { setActiveChat } from "@/lib/chats/store";
import { App } from "./App";

const rootElement = document.getElementById("root");

if (!rootElement) throw new Error("Root element not found");

ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
        {/* A chat that broke the page would break it again on reload: a new chat is the way back. */}
        <ErrorBoundary
            recover={{
                label: "Start a new chat",
                run: async () => {
                    await setActiveChat(null);
                    window.location.reload();
                },
            }}
        >
            <App />
        </ErrorBoundary>
    </React.StrictMode>,
);
