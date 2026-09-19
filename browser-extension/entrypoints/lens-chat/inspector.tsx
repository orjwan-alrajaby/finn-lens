import { ArrowLeft, Pin, X } from "lucide-react";

import { formatEUR } from "@/lib/reasoning-engine";
import { CATEGORIES } from "@/lib/reasoning-engine/constants";
import { FIT_BANDS } from "@/lib/reasoning-engine/fit";
import { coverage, EVIDENCE, type EvidenceId } from "@/lib/lens-chat/evidence";
import type { FitStory, StorySection } from "@/lib/lens-chat/fit-story";
import { heardLines } from "@/lib/lens-chat/plain";
import type { CarLine } from "@/lib/lens-chat/run";
import type { Translation, Understanding } from "@/lib/lens-chat/understanding";
import type { PinnedFinnCar } from "@/lib/types";

import type { CarActions } from "./cards";

/**
 * Where everything the conversation doesn't need lives.
 *
 * Four things a reader may want and none of them every turn: what Lens
 * understood, how it is judging, why this car, and what else it ranked. They
 * used to be printed into the transcript — the whole of them, again, after
 * every message — which is what made a chat feel like a dashboard. Here they
 * are one surface, opened deliberately, closed when done.
 *
 * The honesty the cards carried comes with them: what the reader said, what
 * Lens inferred, what FINN publishes and what nobody can know stay labelled.
 * What doesn't come with them is the pipeline — percentages, mappings and
 * scores are Lens's workings, not the reader's answer.
 */

export type InspectorView = "needs" | "judging" | "why" | "alternatives";

const TITLES: Record<InspectorView, string> = {
    needs: "What Lens understood",
    judging: "How Lens is judging this",
    why: "Why this car",
    alternatives: "Other options",
};

export function Inspector({
    view,
    understanding,
    translation,
    story,
    rows,
    cars,
    scopeLabel,
    actions,
    onView,
    onClose,
    footer,
}: {
    view: InspectorView;
    understanding: Understanding;
    translation: Translation;
    story: FitStory | null;
    rows: (CarLine & { rank: number; isMatch: boolean })[];
    cars: PinnedFinnCar[];
    scopeLabel: string;
    actions: CarActions;
    onView: (view: InspectorView) => void;
    onClose: () => void;
    /** What the reader can do with this search, offered once, at the end. */
    footer?: React.ReactNode;
}) {
    const back = view === "judging" ? "needs" : null;

    return (
        <div className="absolute inset-0 z-30 flex flex-col bg-white" role="dialog" aria-label={TITLES[view]}>
            <header className="flex items-center gap-2 border-b border-finn-cotton px-3 py-2.5">
                {back && (
                    <button
                        type="button"
                        onClick={() => onView(back)}
                        aria-label="Back"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-finn-iron transition hover:bg-finn-snow hover:text-finn-black"
                    >
                        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                    </button>
                )}

                <p className="min-w-0 flex-1 truncate text-sm font-black">{TITLES[view]}</p>

                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-finn-iron transition hover:bg-finn-snow hover:text-finn-black"
                >
                    <X aria-hidden="true" className="h-4 w-4" />
                </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {view === "needs" && <Needs understanding={understanding} onJudging={() => onView("judging")} footer={footer} />}
                {view === "judging" && (
                    <Judging understanding={understanding} translation={translation} cars={cars} scopeLabel={scopeLabel} />
                )}
                {view === "why" && story && <Why story={story} />}
                {view === "alternatives" && <Alternatives rows={rows} actions={actions} scopeLabel={scopeLabel} />}
            </div>
        </div>
    );
}

/* -------------------------------------------------------------------------- */

/** Their situation, in the words they'd use for it. */
function Needs({
    understanding: u,
    onJudging,
    footer,
}: {
    understanding: Understanding;
    onJudging: () => void;
    footer?: React.ReactNode;
}) {
    const heard = heardLines(u);
    const unknown = u.notModelled.filter((item) => item.stance !== "doesntCare");

    return (
        <div className="space-y-4">
            <Part title="How you&rsquo;ll use it" text={heard.situation} />
            <Part title="What matters" text={heard.lookingFor} />
            <Part title="Your limits" text={heard.limits} />
            <Part title="Not chasing" text={heard.notChasing} />

            {u.tension && <Part title="The trade-off" text={u.tension} />}

            {unknown.length > 0 && (
                <div>
                    <Title>What Lens can&rsquo;t judge</Title>
                    <ul className="mt-1 space-y-1">
                        {unknown.map((item) => (
                            <li key={item.said} className="text-sm leading-6 text-finn-black">
                                {item.explanation}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <button type="button" onClick={onJudging} className="text-[13px] font-black text-finn-accent-blue hover:underline">
                How Lens is judging this →
            </button>

            {footer}
        </div>
    );
}

/**
 * The session's own ordering, without the arithmetic.
 *
 * A reader checking this wants to know Lens is weighing their life and not a
 * profile from months ago — an order and a sentence answer that. The shares,
 * the mapping from what they said to a category, and the equipment each one
 * raised are the engine's workings; the equipment itself is here because it's
 * what Lens will actually look for on a car.
 */
function Judging({
    understanding: u,
    translation,
    cars,
    scopeLabel,
}: {
    understanding: Understanding;
    translation: Translation;
    cars: PinnedFinnCar[];
    scopeLabel: string;
}) {
    const active = u.needs.filter((need) => need.status === "active");
    const lessRelevant = new Set(translation.lessRelevant);
    const { profile } = translation;

    return (
        <div className="space-y-4">
            <div>
                <Title>For this conversation</Title>
                <ol className="mt-1 space-y-0.5">
                    {profile.priorities.map((item, index) => (
                        <li key={item.id} className="text-sm leading-6 text-finn-black">
                            {index + 1}. {CATEGORIES[item.id]?.label ?? item.label}
                        </li>
                    ))}
                </ol>
                <p className="mt-1 text-[13px] leading-5 text-finn-iron">
                    Lens gives the most influence to what you said matters most, and keeps the rest to a minimum.
                    {profile.priorities.some((item) => item.filler) && " The last of these come from your saved settings, to give Lens something to weigh."}
                </p>
            </div>

            {profile.rules.length > 0 && (
                <div>
                    <Title>Set aside before ranking</Title>
                    <ul className="mt-1 space-y-0.5">
                        {profile.rules.map((rule) => (
                            <li key={rule.id} className="text-sm leading-6 text-finn-black">
                                {rule.label}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div>
                <Title>What Lens looks for on each car</Title>
                <div className="mt-1 space-y-2.5">
                    {active.map((need) => {
                        const evidence = need.evidence.filter((entry) => !lessRelevant.has(entry.id));

                        return (
                            <div key={need.id}>
                                <p className="text-sm font-black leading-5 text-finn-black">{need.label}</p>

                                {evidence.length > 0 && (
                                    <ul className="mt-0.5 space-y-0.5">
                                        {evidence.map((entry) => (
                                            <li key={entry.id} className="text-[13px] leading-5 text-finn-iron">
                                                {entry.unwanted ? "Without " : ""}
                                                {EVIDENCE[entry.id].label}
                                                {cars.length > 1 && <> — {listedIn(cars, entry.id, entry.unwanted)}</>}
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                {need.notInData && (
                                    <p className="mt-0.5 text-[13px] leading-5 text-finn-iron">
                                        FINN doesn&rsquo;t publish {need.notInData}, so Lens can&rsquo;t check that part.
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>

                {cars.length > 1 && <p className="mt-2 text-[11px] leading-4 text-finn-iron">Counts are across {scopeLabel}.</p>}
            </div>

            {u.capabilities.length > 0 && (
                <div>
                    <Title>Things you said you&rsquo;re fine with</Title>
                    <ul className="mt-1 space-y-0.5">
                        {u.capabilities.map((item) => (
                            <li key={item.label} className="text-[13px] leading-5 text-finn-iron">
                                {item.label}
                                {item.lessRelevant.length > 0 && (
                                    <> — so Lens won&rsquo;t lean on {item.lessRelevant.map((id) => EVIDENCE[id].label.toLowerCase()).join(" or ")}</>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

/** The evidence behind the pick, need by need, in FINN's own facts. */
function Why({ story }: { story: FitStory }) {
    return (
        <div className="space-y-4">
            <div>
                <p className="text-base font-black leading-6 text-finn-black">{story.carName}</p>
                <p className="mt-0.5 text-[13px] leading-5 text-finn-iron">{story.bandMeaning}</p>
            </div>

            {story.sections.map((section) => (
                <Section key={section.key} section={section} />
            ))}

            {story.catch && (
                <div>
                    <Title>The catch</Title>
                    <p className="mt-1 text-sm leading-6 text-finn-black">{story.catch.text}</p>
                    {story.catch.alternative && <p className="mt-0.5 text-[13px] leading-5 text-finn-iron">{story.catch.alternative}</p>}
                </div>
            )}
        </div>
    );
}

function Section({ section }: { section: StorySection }) {
    return (
        <div>
            <Title>{section.title}</Title>
            {section.said && <p className="mt-0.5 text-[13px] leading-5 text-finn-iron">You said: {section.said}</p>}
            <ul className="mt-1 space-y-1">
                {section.lines.map((line) => (
                    <li
                        key={line.text}
                        className={`text-sm leading-6 ${line.tone === "missing" || line.tone === "unknown" ? "text-finn-iron" : "text-finn-black"}`}
                    >
                        {line.text}
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** Everything else Lens ranked, as prices and fit — never as a score. */
function Alternatives({
    rows,
    actions,
    scopeLabel,
}: {
    rows: (CarLine & { rank: number; isMatch: boolean })[];
    actions: CarActions;
    scopeLabel: string;
}) {
    return (
        <div>
            <p className="text-[13px] leading-5 text-finn-iron">
                Lens ranked {scopeLabel} against what you told it. Nothing is pinned unless you pin it.
            </p>

            <ul className="mt-3 divide-y divide-finn-cotton">
                {rows.map((row) => {
                    const pinned = actions.pinnedIds.has(row.id);
                    const flags = [
                        row.budget === "over" ? "over your limit" : null,
                        row.rental === "doesNotFit" ? row.rentalProblem ?? "doesn't fit your dates" : null,
                    ].filter(Boolean);

                    return (
                        <li key={row.id} className="flex items-start gap-2 py-2.5">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-black leading-5 text-finn-black">{row.name}</p>
                                <p className="mt-0.5 text-[13px] leading-5 text-finn-iron">
                                    {row.costComplete ? "" : "from "}
                                    {formatEUR(row.monthly)}/month
                                    {flags.length > 0 && <span className="text-finn-warning-deep"> · {flags.join(" · ")}</span>}
                                </p>
                            </div>

                            <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${FIT_BANDS[row.band].chipClass}`}>
                                {row.bandLabel}
                            </span>

                            <button
                                type="button"
                                onClick={() => actions.onPin(row.id, !pinned)}
                                aria-pressed={pinned}
                                aria-label={pinned ? `Unpin ${row.name}` : `Pin ${row.name}`}
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
                                    pinned ? "bg-finn-pale-blue text-finn-accent-blue" : "text-finn-iron hover:bg-finn-snow hover:text-finn-black"
                                }`}
                            >
                                <Pin aria-hidden="true" className={`h-3.5 w-3.5 ${pinned ? "fill-current" : ""}`} />
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/* -------------------------------------------------------------------------- */

/*
 * One heading style in here, in ordinary capitals. Uppercase tracking on a
 * line like "nothing here stays within €600" shouts a fact that is only a
 * fact, and a surface with four levels of heading is the thing this redesign
 * was trying to get away from.
 */
function Title({ children }: { children: React.ReactNode }) {
    return <p className="text-[13px] font-black leading-5 text-finn-black">{children}</p>;
}

function Part({ title, text }: { title: string; text: string }) {
    if (!text) return null;

    return (
        <div>
            <Title>{title}</Title>
            <p className="mt-1 text-sm leading-6 text-finn-black">{`${text.charAt(0).toUpperCase()}${text.slice(1)}`}</p>
        </div>
    );
}

/** How many of the cars in front of the reader list this, in plain words. */
function listedIn(cars: PinnedFinnCar[], id: EvidenceId, unwanted: boolean): string {
    const { listed, notListed, total } = coverage(cars, id);

    if (!total) return "";

    return unwanted ? `${notListed} of ${total} here go without it` : `${listed} of ${total} here list it`;
}
