import "@/assets/tailwind.css";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ArrowLeft } from "lucide-react";

import { FitAnalysisView } from "@/components/FitAnalysisView";
import { PageHeader } from "@/components/PageHeader";
import { UsingDefaultsNotice } from "@/components/UsingDefaultsNotice";
import { JudgedBy, useJudging } from "@/components/JudgedBy";
import {
    advertisedMonthlyPrice,
    hasSavedLensSettings,
    loadLensSettings,
} from "@/lib/reasoning-engine";
import {
    buildFitAnalysis,
    type FitAnalysis,
} from "@/lib/reasoning-engine/fit";
import type { LensSettings } from "@/lib/reasoning-engine/types";
import { loadPinnedCars, unpinCars } from "@/lib/stored-data";
import type { PinnedFinnCar } from "@/lib/types";
import { openBrowserTab } from "@/lib/utils";

import { CarCard } from "./components/CarCard";
import { NothingPinned } from "./components/EmptyStates";
import { SetSummary } from "./components/SetSummary";
import { Toolbar } from "./components/Toolbar";
import { UnpinDialog } from "./components/UnpinDialog";
import {
    bestMatch,
    cheapestPrice,
    sortCars,
    type SortKey,
} from "./utils/sorting";

/**
 * The pinned cars, as something the reader owns rather than something that
 * happens to them.
 *
 * Pinning was one-way. The button on finn.com toggles, so a car could be
 * unpinned from the page it was pinned on — and nowhere else. Once the reader
 * had moved on, or the listing had gone, the pin was permanent: the compare
 * flow showed the set and gave no way to change it, and the popup showed
 * three of them and no way to change it either. A set you can only add to
 * stops being a comparison and becomes a pile.
 *
 * So: the whole set, with the two things missing from it — removing one, and
 * reading the analysis of one without hunting for it on finn.com. The second
 * matters more than it looks. That analysis is reachable only from a card
 * badge on finn.com, which means the reader could only ask "how does this suit
 * me?" about a car they were already looking at. Here they can ask it about
 * any car they kept, side by side with the rest.
 */
export default function PinsPage() {
    const [cars, setCars] = useState<PinnedFinnCar[] | null>(null);
    const [settings, setSettings] = useState<LensSettings | null>(null);
    const [configured, setConfigured] = useState(false);
    /* Whose answers every band here is by: the chat's while it has a result, else the settings. */
    const judging = useJudging();

    const [openId, setOpenId] = useState<number | null>(null);
    const [checked, setChecked] = useState<number[]>([]);
    const [selecting, setSelecting] = useState(false);
    const [sort, setSort] = useState<SortKey>("pinnedAt");
    const [confirming, setConfirming] = useState<number[] | null>(null);

    const refresh = async () => {
        setCars(await loadPinnedCars());
    };

    useEffect(() => {
        const readSettings = async () => {
            const [saved, isConfigured] = await Promise.all([
                loadLensSettings(),
                hasSavedLensSettings().catch(() => false),
            ]);

            setSettings(saved);
            setConfigured(isConfigured);
        };

        void (async () => {
            await readSettings();
            await refresh();
        })();

        /*
         * Settings saved in another tab reach this one. Every band on the
         * board and every price on it — which contract's price, since
         * business and private differ — is a reading of them, and a board
         * left on the old ones disagrees with the Settings page the reader
         * has just closed.
         */
        const onStorageChanged = (
            changes: Record<string, unknown>,
            areaName: string,
        ) => {
            if (areaName !== "local") return;

            if (SETTINGS_KEYS.some((key) => key in changes)) {
                void readSettings();
            }
        };

        browser.storage.onChanged.addListener(onStorageChanged);

        /*
         * The set can change under this page — a pin on finn.com, or a
         * deletion from Settings — so the page listens rather than assuming
         * it is the only thing touching storage.
         */
        const listener = (message: { type?: string }) => {
            if (message.type === "PINNED_CARS_UPDATED") void refresh();
        };

        browser.runtime.onMessage.addListener(listener);

        return () => {
            browser.runtime.onMessage.removeListener(listener);
            browser.storage.onChanged.removeListener(onStorageChanged);
        };
    }, []);

    /*
     * Which of FINN's two prices every figure on this page quotes: the one
     * for the reader's own contract, which is also what the analysis bills.
     */
    const contractType = (judging?.answers.preferences ?? settings?.preferences)?.contractType ?? "private";

    /*
     * Every car analysed once, and reused by both the list and the open
     * panel. Scoring on demand would let the chip in the list and the band on
     * the reading drift apart, which is exactly the kind of disagreement this
     * product cannot afford.
     *
     * No longer gated on the reader having answered. Lens ships defaults, so
     * there is always something honest to say; `configured` now decides
     * whether the page captions the answers as Lens's assumptions rather than
     * whether it gives any.
     */
    const analyses = useMemo(() => {
        if (!cars || !judging) {
            return new Map<number, FitAnalysis>();
        }

        const { answers } = judging;

        return new Map(
            cars.map((car) => [
                car.id,
                buildFitAnalysis(car, answers.priorities, answers.preferences, answers.features),
            ]),
        );
    }, [cars, judging]);

    const sorted = useMemo(
        () => (cars ? sortCars(cars, sort, analyses, contractType) : []),
        [cars, sort, analyses, contractType],
    );

    const open = sorted.find((car) => car.id === openId) ?? null;
    const openAnalysis = open ? (analyses.get(open.id) ?? null) : null;

    /**
     * The reading, brought to the top when it changes underneath the reader.
     *
     * A full analysis runs to several screens, so a reader who has scrolled
     * into the middle of one and then picks a different car off the rail gets
     * the new car's reading — opened at whatever paragraph the old one had
     * reached. Nothing about the page moves, so the change reads as a glitch
     * rather than as an answer. Below `lg` the panel stacks under the list
     * instead, and there the same click leaves the reading off the bottom of
     * the screen entirely.
     *
     * The guard is what keeps this from fighting the reader: if the top of
     * the reading is already sitting in the band just under the sticky bar,
     * the page is where it should be and nothing moves. It only scrolls when
     * the answer is somewhere the reader is not looking.
     */
    const reading = useRef<HTMLElement>(null);

    /**
     * Where the board was when the reader stepped off it.
     *
     * Coming back is a return, not an arrival: they were part way down a grid,
     * opened one car out of it, and want the grid again — most likely to open
     * the one next to it. Landing them at the top would make every second car
     * they read cost a scroll back to where they already were.
     *
     * It happened to work without this, because removing a five-page analysis
     * makes the page short enough that the browser clamps the scroll near the
     * top. That is not a behaviour, it is an accident of one set with three
     * cars in it, and it goes the other way on a board long enough to hold
     * the old position.
     */
    const boardScroll = useRef(0);
    const wasReading = useRef(false);

    useEffect(() => {
        if (openId == null) return;

        const node = reading.current;

        if (!node) return;

        /* Where the two sticky bars end — see `STUCK` below. */
        const HEADER = STUCK;
        const { top } = node.getBoundingClientRect();

        if (top >= HEADER - 8 && top <= HEADER + 200) return;

        node.scrollIntoView({ behavior: scrollBehaviour(), block: "start" });
    }, [openId]);

    /* And back to where the board was, when the reader leaves the reading. */
    useEffect(() => {
        if (openId != null) {
            wasReading.current = true;

            return;
        }

        if (!wasReading.current) return;

        wasReading.current = false;

        window.scrollTo({ top: boardScroll.current, behavior: scrollBehaviour() });
    }, [openId]);

    /*
     * Worked out once for the set rather than once per card: "cheapest" and
     * "ahead" are claims about the whole board, and a card cannot answer
     * either by looking at itself.
     */
    const leader = useMemo(
        () => bestMatch(cars ?? [], analyses),
        [cars, analyses],
    );

    const floor = useMemo(
        () => cheapestPrice(cars ?? [], contractType),
        [cars, contractType],
    );

    const gapFor = (car: PinnedFinnCar): number | null => {
        const price = advertisedMonthlyPrice(car, contractType);

        if (!price || !floor) return null;

        return price - floor.price;
    };

    /* Leaving selection mode drops the selection with it. */
    const stopSelecting = () => {
        setSelecting(false);
        setChecked([]);
    };

    /**
     * Into the reading, and out of whatever the board was doing.
     *
     * The two views are two jobs — arranging the set, and reading one car —
     * and a half-finished selection carried into the second would come back
     * to a board the reader had stopped looking at. Stepping in ends it.
     */
    const openCar = (id: number) => {
        boardScroll.current = window.scrollY;
        stopSelecting();
        setOpenId(id);
    };

    /*
     * Sent here to read one car — the compare page does this when only one
     * is pinned, since there is nothing to rank yet. The car arrives as
     * `#car=<id>`, on a fresh tab or on this one already open, and the hash
     * is cleared once read so that a reload lands back on the board and the
     * same request made again is still a change.
     */
    useEffect(() => {
        if (cars === null) return;

        const openRequested = () => {
            const match = /^#car=(\d+)$/.exec(window.location.hash);

            if (!match) return;

            history.replaceState(
                null,
                "",
                window.location.pathname + window.location.search,
            );

            const id = Number(match[1]);

            if (cars.some((car) => car.id === id)) openCar(id);
        };

        openRequested();
        window.addEventListener("hashchange", openRequested);

        return () => {
            window.removeEventListener("hashchange", openRequested);
        };
    }, [cars]);

    const remove = async (ids: number[]) => {
        await unpinCars(ids);

        setChecked((current) =>
            current.filter((id) => !ids.includes(id)),
        );

        if (openId !== null && ids.includes(openId)) setOpenId(null);

        /* Everyone else holding a copy of the set is told, not left to guess. */
        void browser.runtime
            .sendMessage({ type: "PINNED_CARS_UPDATED" })
            .catch(() => undefined);

        await refresh();
        setConfirming(null);
    };

    if (cars === null) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-finn-snow">
                <span className="text-sm text-finn-iron">
                    Reading your pinned cars…
                </span>
            </main>
        );
    }

    return (
        <Tooltip.Provider delayDuration={250}>
            <main className="min-h-screen bg-finn-snow text-finn-black">
                {/*
                  * One car is enough to go on to the recommendation: the
                  * compare page has something to say about a lone car too.
                  * Only an empty set has nothing behind the link.
                  */}
                <PageHeader current="pins" pinnedCount={cars.length} />

                <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
                    {cars.length > 0 && (
                        <SetSummary
                            cars={cars}
                            analyses={analyses}
                            contractType={contractType}
                        />
                    )}

                    {judging && cars.length > 0 && <JudgedBy judging={judging} className="mt-4" />}

                    {/* The defaults notice is about the settings; a chat's answers aren't Lens's defaults. */}
                    {!configured && judging?.by !== "chat" && cars.length > 0 && (
                        <div className="mt-4">
                            <UsingDefaultsNotice
                                onPersonalise={() =>
                                    void openBrowserTab(
                                        "OPEN_ONBOARDING_PAGE",
                                    )
                                }
                            />
                        </div>
                    )}

                    {cars.length === 0 ? (
                        <NothingPinned />
                    ) : (
                        /*
                         * The reading only takes a column once there is one.
                         *
                         * This was a fixed two-column split, so on a page
                         * where nothing had been opened yet — which is every
                         * first visit — half the width was a dashed box
                         * explaining what would appear there. The set now
                         * fills the page until a car is opened, and the grid
                         * folds to a single rail beside the reading when one
                         * is.
                         */
                        <>
                        {/*
                          * The way back, and the only thing on the page that
                          * says which of the two views the reader is in.
                          *
                          * A breadcrumb rather than a close button on the
                          * panel: leaving is a move between views, not the
                          * dismissal of a thing, and the reader arrived here
                          * from a board they will want again to sort or thin
                          * out. It sits above both columns because it applies
                          * to both of them.
                          */}
                        {open && (
                            /*
                             * Pinned under the page bar, because a reading
                             * runs to several screens and the way out of a
                             * view cannot be a thing you have to scroll eight
                             * thousand pixels back up to reach. It carries
                             * the page's own ground and a blur so the cards
                             * pass under it rather than through it.
                             */
                            <div className="sticky top-16 z-20 -mx-4 mt-6 flex flex-wrap items-center gap-3 bg-finn-snow/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
                                <button
                                    type="button"
                                    onClick={() => setOpenId(null)}
                                    className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-xs font-black text-finn-black shadow-sm ring-1 ring-black/[0.06] transition hover:bg-finn-pale-blue hover:text-finn-accent-blue hover:ring-finn-accent-blue"
                                >
                                    <ArrowLeft
                                        aria-hidden="true"
                                        className="h-4 w-4"
                                    />
                                    All {cars.length} cars
                                </button>

                                <p className="min-w-0 truncate text-xs text-finn-iron">
                                    Reading{" "}
                                    <strong className="font-black text-finn-black">
                                        {open.name}
                                    </strong>
                                    . Go back for another car, or to sort and
                                    thin out the set.
                                </p>
                            </div>
                        )}

                        <div
                            className={[
                                "mt-6 grid gap-6",
                                open
                                    ? "lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"
                                    : "",
                            ].join(" ")}
                        >
                            <section className="min-w-0">
                                {/*
                                  * The board's own controls, and only on the
                                  * board. Sorting and picking cars off are
                                  * things you do to a set; once the reader
                                  * has stepped into one car they are reading,
                                  * and a row of sort pills beside a five-page
                                  * analysis is furniture for a job nobody is
                                  * doing.
                                  */}
                                {!open && (
                                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                        <h2 className="text-sm font-black text-finn-black">
                                            Your set · {cars.length}
                                        </h2>

                                        <Toolbar
                                            total={cars.length}
                                            checked={checked}
                                            selecting={selecting}
                                            sort={sort}
                                            onSort={setSort}
                                            onStartSelecting={() =>
                                                setSelecting(true)
                                            }
                                            onStopSelecting={stopSelecting}
                                            onSelectAll={() =>
                                                setChecked(
                                                    checked.length ===
                                                        cars.length
                                                        ? []
                                                        : cars.map(
                                                              (car) => car.id,
                                                          ),
                                                )
                                            }
                                            onUnpinChecked={() =>
                                                setConfirming(checked)
                                            }
                                        />
                                    </div>
                                )}

                                {/*
                                  * One card in the reading, and it travels.
                                  *
                                  * The column used to carry the whole set
                                  * beside the analysis, which made the left
                                  * half a second copy of the board the reader
                                  * had just left — and scrolled away within a
                                  * screen of a reading that runs to several.
                                  * What belongs beside an analysis is the car
                                  * it is about, kept in view for as long as
                                  * the reading takes: the photograph, the
                                  * band and the price stay answerable while
                                  * the reasoning goes past.
                                  */}
                                <ul
                                    className={[
                                        "grid gap-4",
                                        open
                                            ? "lg:sticky lg:top-38"
                                            : "sm:grid-cols-2 xl:grid-cols-3",
                                    ].join(" ")}
                                >
                                    {(open ? [open] : sorted).map((car) => (
                                        <CarCard
                                            key={car.id}
                                            car={car}
                                            band={
                                                analyses.get(car.id)
                                                    ?.overall ?? null
                                            }
                                            leading={car.id === leader?.car.id}
                                            contractType={contractType}
                                            cheapest={
                                                floor != null &&
                                                advertisedMonthlyPrice(
                                                    car,
                                                    contractType,
                                                ) === floor.price
                                            }
                                            priceGap={gapFor(car)}
                                            selected={car.id === openId}
                                            checked={checked.includes(car.id)}
                                            selecting={selecting}
                                            subject={car.id === openId}
                                            onOpen={() =>
                                                openCar(car.id)
                                            }
                                            onToggleChecked={() =>
                                                setChecked((current) =>
                                                    current.includes(car.id)
                                                        ? current.filter(
                                                              (id) =>
                                                                  id !==
                                                                  car.id,
                                                          )
                                                        : [
                                                              ...current,
                                                              car.id,
                                                          ],
                                                )
                                            }
                                            onUnpin={() =>
                                                setConfirming([car.id])
                                            }
                                        />
                                    ))}
                                </ul>
                            </section>

                            {openAnalysis && (
                                <section
                                    ref={reading}
                                    className="min-w-0 scroll-mt-38"
                                >
                                    <FitAnalysisView analysis={openAnalysis} />
                                </section>
                            )}
                        </div>
                        </>
                    )}
                </div>

                <UnpinDialog
                    ids={confirming}
                    onCancel={() => setConfirming(null)}
                    onConfirm={(ids) => void remove(ids)}
                />
            </main>
        </Tooltip.Provider>
    );
}

/**
 * Where the page's sticky furniture ends, in pixels.
 *
 * Two bars stack at the top of the reading: the page's own header at 64, and
 * the way back under it at another 64. The card and the analysis then start a
 * `gap-6` below that — the same 24 the grid keeps from the bar when nothing
 * is stuck, so the spacing does not collapse the moment the reader scrolls.
 *
 * Three places have to agree about this number and only one of them is
 * arithmetic: `lg:top-38` on the card, `scroll-mt-38` on the analysis, and
 * this. `38` is that 152 in Tailwind's quarter-rem steps; if the bars change
 * height, all three move together.
 */
const STUCK = 152;

/** The stored settings a band or a price on this page is read from. */
const SETTINGS_KEYS = [
    "finnLensPreferences",
    "finnLensPriorities",
    "finnLensCategoryFeatures",
];

/**
 * The system setting, honoured here rather than in CSS: there is no media
 * query that reaches a `scrollIntoView` or `scrollTo` option.
 */
function scrollBehaviour(): ScrollBehavior {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth";
}
