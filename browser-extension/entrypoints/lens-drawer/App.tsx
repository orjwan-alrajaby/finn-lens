import { useEffect } from "react";

import { adviceFileName } from "@/lib/advice-pdf";
import { ExternalLink, History, Trophy, X } from "lucide-react";

import { BrandMark, IconButton } from "@/components/lens-parts";
import { LocateButton } from "@/components/LocateButton";
import { LoadingScreen } from "@/components/Spinner";
import { requestCloseDrawer, requestOpenDrawer, requestShowCar } from "@/lib/chats/bridge";
import { closestMatch } from "@/lib/chats/judge";
import { theHeadline } from "@/lib/chats/scope";

import { Catch, CarHeader, CostTable, LocateCar, Section, StoryList, UsageSection } from "./parts";
import { ExportButton, usePdfExport } from "./usePdfExport";
import { sameJudgement, useJudgedCar, type JudgedCar } from "./useJudgedCar";
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
/* An earlier result's own judgement, by when it was made; absent for the latest. */
const JUDGEMENT = params.get("judgement");

export function App() {
    const loaded = useJudgedCar(CHAT_ID, CAR_ID, JUDGEMENT);
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
                    <p className="text-[14px] font-black leading-tight">{winner ? (closestMatch(winner.judged.run) ? "Why it's the closest match" : "Why it's the best for you") : "How it fits you"}</p>
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
                {loaded.state === "ready" && !loaded.value.latest ? <Earlier value={loaded.value} /> : null}
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
                        {/* Graded but not ranked: nothing fitted the budget, and only the cars nearest it were ranked. */}
                        {verdict.label !== "Ruled out" && verdict.over === "budget"
                            ? "Nothing here fits your budget, so I ranked only the cars closest to it — and this one costs more than those."
                            : `${verdict.setAside}, so I set this car aside before judging the others.`}{" "}
                        Change your answers in the chat if you'd like it back in.
                    </p>
                </Section>
            ) : null}

            {versus && winnerId != null && !isWinner ? (
                /* Made the cut and lost: said as early as why a car set aside wasn't ranked, against the pick it lost to. */
                <Section title="Why it didn't win">
                    <div className="space-y-2 text-[13px] leading-relaxed text-finn-black">
                        {versus.sentences.map((sentence) => (
                            <p key={sentence}>{sentence}</p>
                        ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        {/* The winner's own gold and trophy, as its chip has them: never mistaken for a button to another car. */}
                        <button
                            type="button"
                            onClick={() => void requestOpenDrawer(value.chat.id, winnerId, sameJudgement(value))}
                            className="inline-flex items-center gap-1.5 rounded-full py-1.5 pr-3.5 pl-1.5 text-[12.5px] font-black text-[#5b3a00] transition-[filter] hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d97706]"
                            style={{ background: "linear-gradient(135deg, #fff3c4 0%, #fcd34d 45%, #f59e0b 100%)", boxShadow: "0 0 0 1px #fff, 0 0 0 3px rgba(245,158,11,.3)" }}
                        >
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#b7791f] shadow-sm">
                                <Trophy aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.6} />
                            </span>
                            See the winner “{versus.match}”
                        </button>
                        <LocateCar id={winnerId} name={versus.match} size="sm" />
                    </div>
                </Section>
            ) : null}

            {story?.sections.length ? (
                <Section title="What you told me, and what it has">
                    <StoryList story={story} value={value} />
                </Section>
            ) : null}

            {story?.catch ? (
                <Section title="Worth knowing">
                    <Catch story={story} />
                </Section>
            ) : null}

            {cost ? (
                <Section title="What it costs">
                    <CostTable cost={cost} />
                </Section>
            ) : null}

            <UsageSection value={value} />

            {value.missing ? (
                <p className="px-5 pb-4 text-[11.5px] text-finn-iron">
                    {value.missing} of the cars this chat judged are no longer in Lens's data, so this reading leaves them out.
                </p>
            ) : null}
        </>
    );
}

/**
 * Said first, where an earlier result was opened: this is what Lens said
 * then, over the cars it judged then — and the chat, and the chips on the
 * page, have moved on to a newer one.
 */
function Earlier({ value }: { value: JudgedCar }) {
    const when = new Date(value.judgement.at).toLocaleString("en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
    const latest = value.chat.judgement;
    const now = latest?.winnerId != null && latest.winnerId !== value.judgement.winnerId ? latest.verdicts[latest.winnerId] : null;

    return (
        <div className="flex gap-2.5 border-b border-finn-cotton bg-finn-warning-lift/50 px-5 py-3 text-[12.5px] leading-snug text-finn-warning-ink">
            <History aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
                <span className="font-black">An earlier result</span> — from {when}, when I judged {theHeadline(value.judgement.headline)}. Your chat has a newer one
                {now ? ", with a different pick" : ""}; the chips on the page show that one.
            </p>
        </div>
    );
}

function Footer({ value, children }: { value: JudgedCar; children?: React.ReactNode }) {
    return (
        <footer className="flex shrink-0 items-center gap-2 border-t border-finn-cotton px-4 py-3">
            {children}
            <LocateButton onLocate={() => requestShowCar(value.car.id)} />
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
