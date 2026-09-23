import { useCallback, useMemo, useRef, useState } from "react";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { FlaskConical, Route } from "lucide-react";
import { TourKitProvider, TourProvider, useTour, type TourConfig } from "@tour-kit/react";

import { GeminiKeyField, type KeyStatus } from "@/components/GeminiKeyField";
import { FIT_BADGE_NEUTRAL_LABEL } from "@/lib/card-controls";
import { demoConversation } from "@/lib/lens-chat/demo-conversation";
import { buildFitAnalysis } from "@/lib/reasoning-engine/fit";
import type { CategoryId, FeatureSelection, LensPreferences } from "@/lib/reasoning-engine/types";

import { BrowserFrame } from "../Tour/BrowserFrame";
import { Coach, SPOTLIGHT_PADDING, useScrollToStep } from "../Tour/Coach";
import { ContinuingRow, MockCard } from "../Tour/MockCard";
import { ChatMock, MockBubble, type ChatStage } from "./ChatMock";

const GUIDE_ID = "finn-lens-ai";

/**
 * Lens AI, shown working and offered once — never pressed.
 *
 * Built like the tour two screens back, on purpose: the reader has already
 * learned that a drawing of finn.com here is live and that the navy bubbles
 * walk them through it. So the same page comes back with the one thing Lens
 * AI adds — reading a message — and the guide opens the chat, shows a message
 * going in, what Lens understood, and the car it picked. The chat itself is
 * not what AI adds: it is there either way, asking its own questions.
 *
 * Two halves of that conversation are different in kind, and the screen says
 * so. The reading of the message is an example of what the model returns.
 * The pick is not: it's the real engine run over the demo cars against the
 * reader's own settings (`demoConversation`), in the chat's real cards.
 *
 * Below the page, the choice. "Not now" is already selected, because Lens is
 * complete without the AI, and nothing is saved until setup finishes.
 */
export function LensAi({
    priorities,
    preferences,
    categoryFeatures,
    enabled,
    apiKey,
    onChangeEnabled,
    onChangeKey,
    onKeyStatus,
}: {
    priorities: CategoryId[];
    preferences: LensPreferences;
    categoryFeatures: Record<CategoryId, FeatureSelection>;
    enabled: boolean;
    apiKey: string;
    onChangeEnabled: (enabled: boolean) => void;
    onChangeKey: (apiKey: string) => void;
    onKeyStatus: (status: KeyStatus) => void;
}) {
    const demo = useMemo(
        () => demoConversation({ priorities, preferences, features: categoryFeatures, basedOn: null }),
        [priorities, preferences, categoryFeatures],
    );

    const pills = useMemo(
        () =>
            new Map(
                demo.cars.map((car) => {
                    const overall = buildFitAnalysis(car, priorities, preferences, categoryFeatures).overall;
                    return [car.id, overall.level === "unknown" ? null : overall] as const;
                }),
            ),
        [demo.cars, priorities, preferences, categoryFeatures],
    );

    const [stage, setStage] = useState<ChatStage>("closed");

    const bubble = useRef<HTMLButtonElement>(null);
    const panel = useRef<HTMLDivElement>(null);

    /* Each step declares the whole chat, so Back and Next compose in any order. */
    const show = useCallback((next: ChatStage) => setStage(next), []);

    const tours = useMemo<TourConfig[]>(
        () => [
            {
                id: GUIDE_ID,
                autoStart: true,
                persistence: false,
                steps: [
                    {
                        id: "bubble",
                        target: bubble,
                        placement: "top-end",
                        spotlightPadding: SPOTLIGHT_PADDING,
                        title: "Ask Lens, on every page with cars",
                        content: (
                            <>
                                This bubble sits in the corner of finn.com whether or not you turn Lens AI on. Open it to talk
                                about the cars on the page, your pinned cars, or the one you're looking at — Lens asks its own
                                questions, and with Lens AI on it reads what you type instead.
                                <Where>Bottom right of finn.com, wherever there are cars.</Where>
                            </>
                        ),
                        onShow: () => show("closed"),
                    },
                    {
                        id: "message",
                        target: panel,
                        placement: "left-start",
                        spotlightPadding: SPOTLIGHT_PADDING,
                        title: "Say it the way you'd say it",
                        content: (
                            <>
                                This is the part Lens AI adds. Describe your life, what worries you and what you can spend —
                                Lens reads that into what it can actually check on a car. Without it, Lens asks you the same
                                ground question by question.
                            </>
                        ),
                        onShow: () => show("listening"),
                    },
                    {
                        id: "understood",
                        target: panel,
                        placement: "left-start",
                        spotlightPadding: SPOTLIGHT_PADDING,
                        title: "It shows what it understood first",
                        content: (
                            <>
                                Your limits, what the car has to do for you, and the equipment FINN lists that could help —
                                with how many cars here have it. When one answer would change the pick, it asks — and waits
                                for your answer before it compares anything.
                            </>
                        ),
                        onShow: () => show("understood"),
                    },
                    {
                        id: "answered",
                        target: panel,
                        placement: "left-start",
                        spotlightPadding: SPOTLIGHT_PADDING,
                        title: "You answer, then you say go",
                        content: (
                            <>
                                Lens waits: no cars are compared while it still has a question open. Once you've answered,
                                it shows what it understood one more time and asks you to confirm — or tell it what it got
                                wrong.
                            </>
                        ),
                        onShow: () => show("answered"),
                    },
                    {
                        id: "fit",
                        target: panel,
                        placement: "left-start",
                        spotlightPadding: SPOTLIGHT_PADDING,
                        title: "Lens's engine picks, and says why in your terms",
                        content: (
                            <>
                                The AI never scores a car. This pick is Lens's own engine, run over these cars against your
                                settings: what you needed, what it found, and the catch — and a car that breaks your limit
                                isn't offered as the answer.
                            </>
                        ),
                        onShow: () => show("fit"),
                    },
                ],
                onComplete: () => show("closed"),
                onSkip: () => show("closed"),
            },
        ],
        [show],
    );

    return (
        <TourKitProvider>
            <TourProvider tours={tours}>
                <div>
                    <div className="text-center">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-finn-accent-blue">Optional</p>

                        <h1 className="mx-auto mt-3 max-w-3xl text-3xl font-black leading-tight tracking-tight text-finn-black sm:text-4xl">
                            Tell Lens what you need, in your own words
                        </h1>

                        <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-finn-iron">
                            Everything you've set up so far works without this. Lens AI adds one thing to finn.com — a chat
                            where you describe your situation and Lens finds the car that fits it.
                        </p>
                    </div>

                    <div className="mt-6 flex items-start gap-2 rounded-[20px] bg-finn-warning/10 px-4 py-3 text-left">
                        <FlaskConical aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-finn-warning" />
                        <p className="text-xs leading-5 text-finn-black">
                            <strong className="font-black">The message and how it's read are an example.</strong> The pick
                            isn't: it's Lens's engine run over the same three invented cars, against the settings you just
                            chose.
                        </p>
                    </div>

                    <div className="mt-5">
                        <BrowserFrame onLensClick={() => {}}>
                            <div className="min-h-[520px]">
                                <div className="grid gap-3 p-4 2xs:grid-cols-2 lg:grid-cols-3">
                                    {demo.cars.map((car) => {
                                        const overall = pills.get(car.id) ?? null;

                                        return (
                                            <MockCard
                                                key={car.id}
                                                car={car}
                                                level={overall?.level ?? null}
                                                label={overall?.label ?? FIT_BADGE_NEUTRAL_LABEL}
                                                pinned={false}
                                                open={false}
                                                onTogglePin={() => {}}
                                                onOpenPanel={() => {}}
                                            />
                                        );
                                    })}
                                </div>

                                <ContinuingRow />
                            </div>

                            {(
                                <ChatMock
                                    stage={stage}
                                    demo={demo}
                                    panelRef={panel}
                                    onCompare={() => setStage("fit")}
                                    onClose={() => setStage("closed")}
                                />
                            )}

                            <MockBubble
                                open={stage !== "closed"}
                                bubbleRef={bubble}
                                onClick={() => setStage((current) => (current === "closed" ? "understood" : "closed"))}
                            />
                        </BrowserFrame>
                    </div>

                    <div className="mt-3 flex justify-center">
                        <ReplayButton />
                    </div>

                    <section className="mx-auto mt-8 max-w-3xl rounded-[26px] bg-white p-5 shadow-sm sm:p-6">
                        <p id="lens-ai-choice" className="text-sm font-black text-finn-black">
                            Use Lens AI?
                        </p>
                        <p className="mt-1 text-xs leading-5 text-finn-iron">
                            It needs a free Gemini API key of your own. What you type to Lens, and facts about the cars being
                            discussed, go to Google, whose free tier may use them to improve its products.
                        </p>

                        <ToggleGroup.Root
                            type="single"
                            value={enabled ? "on" : "off"}
                            onValueChange={(next) => {
                                if (next) onChangeEnabled(next === "on");
                            }}
                            aria-labelledby="lens-ai-choice"
                            className="mt-3 flex gap-2"
                        >
                            {[
                                ["off", "Not now"],
                                ["on", "Turn on Lens AI"],
                            ].map(([value, label]) => (
                                <ToggleGroup.Item
                                    key={value}
                                    value={value!}
                                    className={[
                                        "h-11 flex-1 rounded-2xl text-xs font-black shadow-sm transition",
                                        "bg-finn-pale-blue text-finn-black hover:bg-finn-cotton",
                                        "data-[state=on]:bg-finn-accent-blue data-[state=on]:text-white",
                                    ].join(" ")}
                                >
                                    {label}
                                </ToggleGroup.Item>
                            ))}
                        </ToggleGroup.Root>

                        {enabled ? (
                            <div className="mt-5">
                                <GeminiKeyField apiKey={apiKey} onChange={onChangeKey} onStatus={onKeyStatus} />
                                <p className="mt-3 text-[11px] leading-4 text-finn-iron">
                                    Your key is stored in this browser's extension storage, where websites can't read it, and
                                    is only ever sent to Google. The free tier allows a small number of requests a day; when
                                    they run out, Lens AI says so and everything else keeps working.
                                </p>
                            </div>
                        ) : (
                            <p className="mt-3 text-[11px] leading-4 text-finn-iron">
                                Lens will work from your priorities and driving alone, and nothing is sent anywhere. You can turn
                                Lens AI on any time in Settings → Lens AI.
                            </p>
                        )}
                    </section>
                </div>

                <Guide />
            </TourProvider>
        </TourKitProvider>
    );
}

function Guide() {
    useScrollToStep();

    return <Coach finishLabel="Done" />;
}

function ReplayButton() {
    const { isActive, start } = useTour(GUIDE_ID);

    if (isActive) return null;

    return (
        <button
            type="button"
            onClick={() => start()}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[11px] font-bold text-finn-accent-blue shadow-sm transition hover:bg-finn-pale-blue"
        >
            <Route aria-hidden="true" className="h-3.5 w-3.5" />
            Show me how it works again
        </button>
    );
}

function Where({ children }: { children: string }) {
    return <span className="mt-2 block text-[11px] font-bold text-finn-pale-blue">{children}</span>;
}
