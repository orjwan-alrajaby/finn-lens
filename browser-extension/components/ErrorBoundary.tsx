import { Component, type ReactNode } from "react";
import { RotateCw } from "lucide-react";

import { BrandMark } from "./lens-parts";

/**
 * What a reader sees when one of Lens's pages breaks: a way out, rather than
 * a blank white frame sitting on finn.com.
 *
 * Every page is wrapped in one (`main.tsx`). Reloading is always offered;
 * `recover` is a page's own way back — the chat starts a new chat, since a
 * chat that broke the page would break it again on reload.
 */

export interface Recover {
    label: string;
    run: () => void | Promise<void>;
}

export function CrashScreen({ recover, onReload }: { recover?: Recover; onReload: () => void }) {
    return (
        <div role="alert" className="flex min-h-[240px] flex-col items-center justify-center gap-3 bg-finn-snow px-6 py-10 text-center font-sans text-finn-black">
            <BrandMark size={40} />
            <p className="text-[15px] font-black">Something went wrong in Lens</p>
            <p className="max-w-72 text-[12.5px] leading-snug text-finn-iron">Your chats and saved answers are kept. Reloading usually puts it right.</p>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
                <button
                    type="button"
                    onClick={onReload}
                    className="inline-flex items-center gap-1.5 rounded-full bg-finn-highlight-navy px-4 py-2 text-[12.5px] font-black text-white transition-colors hover:bg-finn-accent-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue"
                >
                    <RotateCw aria-hidden="true" className="h-3.5 w-3.5" />
                    Reload
                </button>
                {recover ? (
                    <button
                        type="button"
                        onClick={() => void recover.run()}
                        className="rounded-full bg-white px-4 py-2 text-[12.5px] font-black text-finn-accent-blue ring-1 ring-finn-accent-blue/35 transition-colors hover:bg-finn-pale-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue"
                    >
                        {recover.label}
                    </button>
                ) : null}
            </div>
        </div>
    );
}

export class ErrorBoundary extends Component<{ children: ReactNode; recover?: Recover }, { failed: boolean }> {
    override state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    override componentDidCatch(error: unknown) {
        console.error("[Lens] a page broke", error);
    }

    override render() {
        return this.state.failed ? <CrashScreen recover={this.props.recover} onReload={() => window.location.reload()} /> : this.props.children;
    }
}
