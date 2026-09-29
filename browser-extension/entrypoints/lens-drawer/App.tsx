import { useEffect } from "react";

import { adviceFileName } from "@/lib/advice-pdf";
import { ExternalLink, LocateFixed, X } from "lucide-react";

import { BrandMark, IconButton } from "@/components/lens-parts";
import { LoadingScreen } from "@/components/Spinner";
import { requestCloseDrawer, requestOpenDrawer, requestShowCar } from "@/lib/chats/bridge";

import { Catch, CarHeader, CostTable, Section, StoryList } from "./parts";
import { ExportButton, usePdfExport } from "./usePdfExport";
import { useJudgedCar, type JudgedCar } from "./useJudgedCar";
import { WinnerView } from "./WinnerView";

/**
 * The drawer behind a chip: how one car fits what the reader told the chat —
 * or, behind the gold one, the whole case for the car Lens picked, which can
 * be saved as a PDF.
 *
 * Opened from a card's chip, or from a car in the chat's result. Everything in
 * it is read off the chat's judgement — see `useJudgedCar`.
 */

const params = new URLSearchParams(window.location.search);
const CHAT_ID = params.get("chat");
const CAR_ID = Number(params.get("car")) || null;

export function App() {
    const loaded = useJudgedCar(CHAT_ID, CAR_ID);
    const winner = loaded.state === "ready" && loaded.value.isWinner ? loaded.value : null;
    const pdf = usePdfExport(winner ? adviceFileName(winner.car.name) : null);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") void requestCloseDrawer();
        };

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    return (
        <div className="flex h-screen flex-col bg-white font-sans text-finn-black">
            <header className="flex shrink-0 items-center gap-2.5 border-b border-finn-cotton px-4 py-3">
                <BrandMark size={30} className="ring-1 ring-finn-cotton" />
                <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-black leading-tight">{winner ? "Why it's the best for you" : "How it fits you"}</p>
                    <p className="truncate text-[11.5px] text-finn-iron">
                        {loaded.state === "ready" ? `From your chat: ${loaded.value.chat.title}` : "From your chat with Lens"}
                    </p>
                </div>
                <IconButton label="Close" onClick={() => void requestCloseDrawer()}>
                    <X aria-hidden="true" className="h-5 w-5" />
                </IconButton>
            </header>

            <main className="min-h-0 flex-1 overflow-y-auto">
                {loaded.state === "loading" ? <LoadingScreen className="py-24">Reading this car…</LoadingScreen> : null}
                {loaded.state === "gone" ? <p className="px-5 py-10 text-center text-[13px] text-finn-iron">{loaded.reason}</p> : null}
                {winner ? <WinnerView value={winner} /> : null}
                {loaded.state === "ready" && !winner ? <CarView value={loaded.value} /> : null}
            </main>

            {loaded.state === "ready" ? (
                <Footer value={loaded.value}>{winner ? <ExportButton exporting={pdf.exporting} onExport={pdf.start} /> : null}</Footer>
            ) : null}

            {/*
             * The PDF's copy of the argument: laid out wider than the drawer,
             * off-screen, and only while a file is being made.
             */}
            {winner && pdf.exporting ? (
                <div aria-hidden="true" className="pointer-events-none fixed top-0 -left-[10000px]">
                    <div ref={pdf.printable} data-exporting="" className="w-[760px] bg-white font-sans text-finn-black">
                        <WinnerView value={winner} print />
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function CarView({ value }: { value: JudgedCar }) {
    const { story, versus, cost, verdict, judgement, isWinner } = value;
    const winnerId = judgement.winnerId;

    return (
        <>
            <CarHeader value={value} />

            {story ? <p className="px-5 pb-4 text-[13px] leading-relaxed text-finn-black">{story.bandMeaning}</p> : null}

            {verdict.setAside ? (
                <Section title="Why it wasn't ranked">
                    <p className="text-[13px] leading-relaxed text-finn-black">
                        {verdict.setAside}, so I set this car aside before judging the others. Change your answers in the chat if you'd like it back in.
                    </p>
                </Section>
            ) : null}

            {story?.sections.length ? (
                <Section title="What you told me, and what it has">
                    <StoryList story={story} />
                </Section>
            ) : null}

            {story?.catch ? (
                <Section title="Worth knowing">
                    <Catch story={story} />
                </Section>
            ) : null}

            {versus && winnerId != null && !isWinner ? (
                <Section title={`Against my pick, the ${versus.match}`}>
                    <div className="space-y-2 text-[13px] leading-relaxed text-finn-black">
                        {versus.sentences.map((sentence) => (
                            <p key={sentence}>{sentence}</p>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => void requestOpenDrawer(value.chat.id, winnerId)}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-finn-pale-blue px-3.5 py-2 text-[12.5px] font-black text-finn-accent-blue transition-colors hover:bg-finn-accent-blue hover:text-white"
                    >
                        See the {versus.match}
                    </button>
                </Section>
            ) : null}

            {cost ? (
                <Section title="What it costs">
                    <CostTable cost={cost} />
                </Section>
            ) : null}

            {value.missing ? (
                <p className="px-5 pb-4 text-[11.5px] text-finn-iron">
                    {value.missing} of the cars this chat judged are no longer in Lens's data, so this reading leaves them out.
                </p>
            ) : null}
        </>
    );
}

function Footer({ value, children }: { value: JudgedCar; children?: React.ReactNode }) {
    return (
        <footer className="flex shrink-0 items-center gap-2 border-t border-finn-cotton px-4 py-3">
            {children}
            <button
                type="button"
                onClick={() => void requestShowCar(value.car.id)}
                aria-label="Show this car on the page"
                title="Show this car on the page"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-finn-cotton text-finn-black transition-colors hover:bg-finn-pale-blue hover:text-finn-accent-blue"
            >
                <LocateFixed aria-hidden="true" className="h-4 w-4" />
            </button>
            {value.url ? (
                <a
                    href={value.url}
                    target="_top"
                    className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-full bg-finn-highlight-navy px-4 text-[12.5px] font-black text-white transition-colors hover:bg-finn-accent-blue"
                >
                    View on FINN
                    <ExternalLink aria-hidden="true" className="h-4 w-4" />
                </a>
            ) : null}
        </footer>
    );
}
