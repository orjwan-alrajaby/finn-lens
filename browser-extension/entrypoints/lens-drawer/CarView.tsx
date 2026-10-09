import { Trophy } from "lucide-react";

import { WINNER_GOLD } from "@/components/lens-parts";
import { requestOpenDrawer } from "@/lib/chats/bridge";

import { Catch, CarHeader, CostTable, LocateCar, PrintMasthead, Section, StoryList, UsageSection } from "./parts";
import { sameJudgement, type JudgedCar } from "./useJudgedCar";

/**
 * How one car fits. `print` lays it out for the PDF: with a masthead, and
 * without the buttons that only mean something on screen — the winner, and
 * any car it names, link to FINN instead.
 */
export function CarView({ value, print = false }: { value: JudgedCar; print?: boolean }) {
    const { story, versus, cost, verdict, judgement, isWinner } = value;
    const winnerId = judgement.winnerId;

    return (
        <>
            {print ? <PrintMasthead value={value} kind="how this car fits you" /> : null}
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
                    {/* In the file, the winner on FINN: there's no drawer or page to go to. */}
                    {print ? <LocateCar id={winnerId} name={versus.match} value={value} print /> : null}
                    <div className="finn-lens-screen-only mt-3 flex flex-wrap items-center gap-2">
                        {/* The winner's own gold and trophy, as its chip has them: never mistaken for a button to another car. */}
                        <button
                            type="button"
                            onClick={() => void requestOpenDrawer(value.chat.id, winnerId, sameJudgement(value))}
                            className="inline-flex items-center gap-1.5 rounded-full py-1.5 pr-3.5 pl-1.5 text-[12.5px] font-black text-[#5b3a00] transition-[filter] hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d97706]"
                            style={WINNER_GOLD}
                        >
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#b7791f] shadow-sm">
                                <Trophy aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.6} />
                            </span>
                            See {versus.match}
                        </button>
                        <LocateCar id={winnerId} name={versus.match} size="sm" winner />
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
                    <Catch story={story} value={value} print={print} />
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
