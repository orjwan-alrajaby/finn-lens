import "@/assets/tailwind.css";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SlidersHorizontal, Sparkles } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";

import type { PinnedFinnCar } from "@/lib/types";
import { EmptyState } from "@/components/EmptyState";
import { FinnLink } from "@/components/FinnLink";
import { NavButton, PageHeader } from "@/components/PageHeader";
import { Spinner } from "@/components/Spinner";

import { AdjustDrawer } from "./components/AdjustDrawer";
import { Advice } from "./advice";
import { Challenge } from "./advice/Challenge";
import { ChooseSource, SourceBar, type CarsChoice, type ChosenSource, type SourceOffers } from "./lens-ai/Source";
import { TellLens } from "./lens-ai/TellLens";
import { useCompareStore } from "./store";
import { carsForSearch, HANDOFF_KEY, loadSavedSearches, loadSession, nameFor, takeHandOff, type SearchCars } from "@/lib/lens-chat/session";
import { currentJudging } from "@/lib/lens-chat/judging";
import { distinctNames } from "@/lib/car-labels";
import { loadLensSettings } from "@/lib/reasoning-engine";
import { copyFeatures } from "./store";

/**
 * The compare page: the answer, and a drawer to argue with it.
 *
 * This was a four-step wizard — priorities, feature picks, driving
 * assumptions, and only then a recommendation. Two things were wrong with
 * that. The product already has an onboarding flow that asks those same
 * questions once, so the wizard re-asked what the reader had answered; and
 * the questions are unanswerable in the abstract anyway. Nobody knows
 * whether their order is right until they have seen what it recommends.
 *
 * So the page opens on the recommendation, built from the reader's saved
 * answers, and "something doesn't look right?" opens those answers over it in
 * a drawer. The drawer holds a draft and commits it in one act, so this page
 * re-reasons when the reader saves rather than on every keystroke inside it.
 */
export default function CompareTab({
  cars: pinned,
  onSettings,
  onReadCar,
}: {
  /** null until the pinned set has been read — distinct from none pinned. */
  cars: PinnedFinnCar[] | null;
  onSettings: () => void;
  /** Opens the pinned-cars page with this car's breakdown already open. */
  onReadCar: (carId: number) => void;
}) {
  const loadSettings = useCompareStore((state) => state.loadSettings);
  const settingsLoaded = useCompareStore((state) => state.settingsLoaded);
  const answersRevision = useCompareStore((state) => state.answersRevision);

  const [adjusting, setAdjusting] = useState(false);

  /*
   * Which search this page is about. Null while Lens works out whether there
   * is anything to ask — and again whenever the reader asks to change it.
   */
  const [source, setSource] = useState<ChosenSource | null>(null);
  const [offers, setOffers] = useState<SourceOffers | null>(null);
  /** Which cars, when the reader has picked them; otherwise they follow the answers (`defaultCars`). */
  const [chosenCars, setChosenCars] = useState<CarsChoice | null>(null);
  const applyAnswers = useCompareStore((state) => state.applyAnswers);
  const setAnswersFrom = useCompareStore((state) => state.setAnswersFrom);

  /**
   * Which of the two readings is on screen.
   *
   * They used to be one page, and the trouble with that was not length but
   * subject: the recommendation argued for a car and the hot seat argued for
   * a different one, with a control halfway down deciding which the cost
   * section was currently about. The PDF settled it — the export flattened
   * both into a document that recommended and challenged at once, and a
   * reader sending it on could not say which car it was for.
   *
   * Local rather than in the store: which tab is open is not one of the
   * reader's answers and has no bearing on the reasoning. The *challenger*
   * they picked does live in the store, so crossing between tabs and back
   * finds the hot seat as they left it.
   */
  const [view, setView] = useState<"advice" | "challenge">("advice");

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  /*
   * Opened from the chat, this page is that conversation's search and says
   * so. Opened any other way, it asks — but only when there is something to
   * ask about; a reader who has never talked to Lens sees the recommendation
   * as they always have.
   */
  useEffect(() => {
    const read = async (onArrival: boolean) => {
      const [session, searches, handedOver, judging] = await Promise.all([
        loadSession(),
        loadSavedSearches(),
        takeHandOff(),
        currentJudging(),
      ]);

      setOffers({ session, searches });

      if (handedOver?.searchId) {
        const kept = searches.find((search) => search.id === handedOver.searchId);

        if (kept) {
          chooseRef.current({ kind: "saved", search: kept });
          return;
        }
      }

      if (handedOver && session) {
        chooseRef.current({ kind: "session", session });
        return;
      }

      if (!onArrival) return;

      /*
       * With comparisons the reader kept, the page asks which one it is
       * about, as they asked it to. Without any, it follows the same rule as
       * every badge and page: the chat while it has a result, the settings
       * otherwise — and says so, with both a menu away.
       */
      if (searches.length) return;

      chooseRef.current(judging.by === "chat" ? { kind: "session", session: judging.session } : { kind: "settings" });
    };

    void read(true);

    /*
     * Already open when the chat hands over. The background focuses an open
     * page rather than opening a second one, and this page used to read the
     * hand-off only when it loaded — so pressing the button a second time
     * brought forward a page still about whatever it showed before.
     */
    const onChange = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === "local" && HANDOFF_KEY in changes && changes[HANDOFF_KEY]?.newValue) void read(false);
    };

    browser.storage.onChanged.addListener(onChange);

    return () => browser.storage.onChanged.removeListener(onChange);
  }, [applyAnswers]);

  /*
   * The cars this page ranks follow the search it is about. A search from the
   * chat, or one the reader kept, is about the cars that conversation
   * compared; the reader's own settings are about their pinned cars.
   */
  /*
   * Which cars, when the reader hasn't said: a search's own cars for a
   * search; for the settings, the pinned cars when there are two to compare,
   * and otherwise the chat's — "rank them by my settings" with nothing pinned
   * used to show nothing at all, while seventy cars sat in the chat.
   */
  const defaultCars = (chosen: ChosenSource): CarsChoice => {
    if (chosen.kind === "session") return { kind: "search", search: chosen.session, from: "chat", name: nameFor(chosen.session) };
    if (chosen.kind === "saved") return { kind: "search", search: chosen.search, from: "kept", name: chosen.search.name };
    if ((pinned?.length ?? 0) >= 2 || !offers?.session) return { kind: "pinned" };

    return { kind: "search", search: offers.session, from: "chat", name: nameFor(offers.session) };
  };

  const carsChoice = source ? (chosenCars ?? defaultCars(source)) : null;
  const search = carsChoice?.kind === "search" ? carsChoice.search : null;
  /* A search's rules are its answers: they apply when that search is doing the ranking. */
  const withRules = Boolean(
    carsChoice?.kind === "search" &&
      ((source?.kind === "session" && carsChoice.from === "chat") || (source?.kind === "saved" && carsChoice.from === "kept")),
  );
  const [searched, setSearched] = useState<SearchCars | null>(null);

  useEffect(() => {
    setSearched(null);
    if (!search) return;

    let live = true;
    void carsForSearch(search, withRules).then((found) => {
      if (live) setSearched(found);
    });

    return () => {
      live = false;
    };
    /* `pinned` too: pinning one of these cars here swaps in the reader's pinned copy. */
  }, [search, pinned, withRules]);

  const rawCars = search ? (searched?.cars ?? null) : pinned;
  const cars = useMemo(() => (rawCars ? distinctNames(rawCars) : null), [rawCars]);

  /* Said once, above the answer: whose answers, over which cars. */
  const judgedOn =
    source && carsChoice
      ? `Ranked by ${
          source.kind === "session"
            ? source.session.basis === "settings"
              ? "your chat's search (built from your saved settings and your filters)"
              : "what you told the chat"
            : source.kind === "saved"
              ? `your kept search “${source.search.name}”`
              : "your saved Lens settings"
        }, across ${
          carsChoice.kind === "pinned"
            ? `your ${cars?.length ?? 0} pinned ${cars?.length === 1 ? "car" : "cars"}`
            : `the ${cars?.length ?? 0} cars from ${carsChoice.from === "chat" ? "your chat" : `“${carsChoice.name}”`}`
        }.`
      : undefined;

  /** A search the reader picked applies to this page alone; settings restore theirs. */
  const chooseSource = (chosen: ChosenSource) => {
    setAnswersFrom(
      chosen.kind === "settings"
        ? { kind: "settings" }
        : { kind: "search", name: chosen.kind === "session" ? `your chat: ${nameFor(chosen.session)}` : chosen.search.name },
    );
    /* New answers start on their own cars; a cars choice made for the old ones doesn't carry over. */
    setChosenCars(null);

    if (chosen.kind === "settings") {
      void loadLensSettings().then((saved) =>
        applyAnswers(
          {
            priorities: saved.priorities,
            preferences: saved.preferences,
            features: copyFeatures(saved.categoryFeatures),
            basedOn: saved.basedOn,
          },
          "session",
        ),
      );
    } else {
      applyAnswers(chosen.kind === "session" ? chosen.session.answers : chosen.search.answers, "session");
    }

    setSource(chosen);
  };

  const chooseRef = useRef(chooseSource);
  chooseRef.current = chooseSource;

  /*
   * Which of the page's states is on screen. All three are drawn inside the
   * same shell below rather than returned early from here, which is the point
   * of splitting them out: a reader who opens the page with nothing pinned
   * used to get a bare card on white — no bar, no mark, and no way on to the
   * pinned cars or the settings, which are the only two things that could
   * have helped them. The page looked like a different product in exactly the
   * state where the reader most needed to recognise it.
   */
  const [onlyCar] = cars ?? [];
  const canCompare = (cars?.length ?? 0) >= 2;
  const ready = canCompare && settingsLoaded;

  return (
    <Tooltip.Provider delayDuration={350}>
      {/*
        * Snow, not white — the ground the pinned-cars and settings pages use.
        * This page was the odd one out, and it cost more than consistency:
        * nearly everything on it is a white card, and a white card on a white
        * page is held up by its shadow alone. On snow the cards separate, and
        * the empty state can be the same card every other page uses.
        *
        * The exported PDF is unaffected — it paints its own white ground (see
        * `advicePdfOptions`), because a document is not a screen.
        */}
      <main className="min-h-screen bg-finn-snow text-finn-black">
        <PageHeader current="compare">
          {/*
            * Only once there is a recommendation to argue with. The drawer
            * edits the answers this page reasons from, and offered over an
            * empty page it invites the reader to tune the inputs to a result
            * that does not exist yet — the wizard-before-the-answer mistake
            * this page was built to undo, in miniature.
            */}
          {ready && (
            <NavButton
              icon={<SlidersHorizontal aria-hidden="true" className="h-4 w-4" />}
              label="Adjust my answers"
              onClick={() => setAdjusting((was) => !was)}
              active={adjusting}
              expanded={adjusting}
            />
          )}
        </PageHeader>

        {/*
          * The page keeps its full width, and there is no wrapper around it
          * any more. It used to give up 27rem to the drawer, which squeezed
          * the advice into a column too narrow to read while the reader
          * worked in one too narrow to work in; the drawer overlays it now.
          */}
        <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {/*
            * The source first, and only then the cars it is about. The page
            * used to check the pinned cars before anything else, so a reader
            * who had built a search in the chat and pinned nothing never got
            * as far as it: "Nothing to compare yet", over a search of 76 cars.
            */}
          {!offers ? (
            <Loading>Reading your searches…</Loading>
          ) : !source ? (
            <ChooseSource offers={offers} onChoose={chooseSource} />
          ) : (
            <>
              <SourceBar
                source={source}
                offers={offers}
                cars={carsChoice!}
                pinnedCount={pinned?.length ?? 0}
                detail={
                  search
                    ? [
                        searched?.missing ? `${searched.missing} of these cars are no longer available` : "",
                        searched?.setAside ? `${searched.setAside} set aside by the search's own rules` : "",
                      ]
                        .filter(Boolean)
                        .join(" · ") || null
                    : null
                }
                onAnswers={chooseSource}
                onCars={setChosenCars}
                onBrowse={() => setSource(null)}
              />

              {cars === null ? (
                <Loading>{search ? "Reading the cars from this search…" : "Reading your pinned cars…"}</Loading>
              ) : cars.length === 0 ? (
                <EmptyState
                  icon={<Sparkles aria-hidden="true" className="h-7 w-7" />}
                  title={search ? "The cars from this search aren't available any more" : "Nothing to compare yet"}
                >
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-finn-iron">
                    {search ? (
                      <>
                        FINN no longer lists them, or Lens has let go of them. Open the chat on <FinnLink /> again to compare what's
                        there now.
                      </>
                    ) : (
                      <>
                        Pin a few cars on <FinnLink /> first. Finn Lens will automatically include every pinned car here.
                      </>
                    )}
                  </p>

                  {!search && offers.session && (
                    <button
                      type="button"
                      onClick={() => setChosenCars({ kind: "search", search: offers.session!, from: "chat", name: nameFor(offers.session!) })}
                      className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-finn-accent-blue px-5 text-xs font-black text-white shadow-sm transition hover:bg-finn-highlight-navy"
                    >
                      Rank the {offers.session.carIds.length} cars from your chat instead
                    </button>
                  )}
                </EmptyState>
              ) : !canCompare && onlyCar ? (
                search ? (
                  <EmptyState title="This search is about one car">
                    <p className="mt-2 text-sm leading-6 text-finn-iron">
                      The recommendation page weighs two or more cars against each other. Everything about this one is in the chat,
                      where you left it.
                    </p>
                  </EmptyState>
                ) : (
                  <EmptyState
                    media={
                      <img
                        src={onlyCar.images.thumbnail}
                        alt={onlyCar.name}
                        className="mx-auto h-32 w-52 rounded-2xl object-cover"
                      />
                    }
                    title="One car is pinned"
                  >
                    <p className="mt-2 text-sm leading-6 text-finn-iron">
                      Keep browsing and pin another car. Finn Lens compares the full
                      pinned set automatically — there is no separate selection step.
                    </p>

                    {/*
                      * The one car can still be read on its own, which is the only
                      * useful thing to offer someone who cannot compare yet — so
                      * this goes straight to its breakdown, not to the board.
                      */}
                    <button
                      type="button"
                      onClick={() => onReadCar(onlyCar.id)}
                      className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-finn-accent-blue px-5 text-xs font-black text-white shadow-sm transition hover:bg-finn-highlight-navy"
                    >
                      See how this one suits you
                    </button>
                  </EmptyState>
                )
              ) : !settingsLoaded ? (
                /*
                 * Held until the saved answers have actually been read. A
                 * recommendation built from the defaults, replaced a tick later by
                 * one built from the reader's own settings, is a wrong answer
                 * shown confidently.
                 */
                <Loading>Reading your settings…</Loading>
              ) : (
                <>
                  <TellLens cars={cars} />

                  {/*
                    * Two readings of one set of answers, and the tabs say which is
                    * which before either is read. Above the page rather than inside
                    * it, because they switch the whole subject — a control that
                    * changed the page from under its own heading is what this split
                    * was undoing.
                    */}
                  <div
                    role="tablist"
                    aria-label="Advice views"
                    className="finn-lens-screen-only mb-6 inline-flex rounded-full bg-finn-cotton p-1"
                  >
                    <ViewTab id="advice" current={view} onSelect={setView} label="The recommendation" />
                    <ViewTab id="challenge" current={view} onSelect={setView} label="Challenge it" />
                  </div>

                  {view === "advice" ? (
                    <Advice cars={cars} judgedOn={judgedOn} onAdjust={() => setAdjusting(true)} onChallenge={() => setView("challenge")} />
                  ) : (
                    <Challenge cars={cars} onAdjust={() => setAdjusting(true)} onBack={() => setView("advice")} />
                  )}
                </>
              )}
            </>
          )}
        </div>

        {ready && (
          <AdjustDrawer
            /*
              * Re-seeded when answers arrive from Lens AI rather than from
              * the drawer itself — see `answersRevision` in the store.
              */
            key={answersRevision}
            open={adjusting}
            onOpenChange={setAdjusting}
            onSettings={onSettings}
          />
        )}
      </main>
    </Tooltip.Provider>
  );
}

/**
 * Waiting, inside the page rather than instead of it.
 *
 * `LoadingScreen` is a whole-window `<main>`, which is right for a page that
 * has not drawn its bar yet and wrong here: the bar is already up, and
 * replacing the page with a centred spinner would take the mark and the exits
 * away for as long as storage takes to answer.
 */
function Loading({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="flex items-center justify-center gap-3 py-20 text-sm text-finn-iron"
    >
      <Spinner className="h-5 w-5 text-finn-black/70" />
      {children}
    </p>
  );
}

/**
 * One of the two views, as a tab.
 *
 * `role="tab"` with `aria-selected` rather than two buttons that merely look
 * chosen: a reader on a screen reader is being told these are alternatives and
 * which one they are in, which is the whole content of the control.
 *
 * Hidden from the PDF along with every other control. Each view exports
 * itself, so a row of tabs in the file would be a picture of a choice the
 * reader has already made.
 */
function ViewTab({
  id,
  current,
  onSelect,
  label,
}: {
  id: "advice" | "challenge";
  current: "advice" | "challenge";
  onSelect: (view: "advice" | "challenge") => void;
  label: string;
}) {
  const selected = current === id;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => onSelect(id)}
      className={[
        "rounded-full px-4 py-2 text-xs font-black transition-colors",
        selected
          ? "bg-white text-finn-black shadow-sm"
          : "text-finn-iron hover:text-finn-black",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
