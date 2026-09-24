import "@/assets/tailwind.css";
import { SearchCard } from "./components/SearchCard";
import { useState, useEffect } from "react";
import { Settings } from "lucide-react";
import { FINN_BASE_URL } from "@/lib/constants";
import { LoadingScreen } from "@/components/Spinner";
import { GettingStarted } from "./components/GettingStarted";
import { GoToFinnSection } from "./components/GoToFinnSection";
import Logo from "/icon/128.png";
import { BRAND_IDLE_SPIN } from "@/lib/brand-spinner";
import Tabs from "./components/Tabs";
import { MetricCard } from "./components/MetricCard";
import type { PinnedFinnCar } from "@/lib/types";
import { openBrowserTab } from "@/lib/utils";
import { loadLensSettings } from "@/lib/reasoning-engine";
import type { ContractType } from "@/lib/reasoning-engine/types";

async function checkIfActiveTabIsFinn() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return false;
  return tab.url.includes(FINN_BASE_URL);
}

async function getPinnedCars(): Promise<Record<number, PinnedFinnCar>> {
  const stored = await browser.storage.local.get("pinnedCars");
  return (stored.pinnedCars as Record<number, PinnedFinnCar> | undefined) ?? {};
}

async function getDetectedCarsCount() {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id) {
    return 0;
  }

  const stats = await browser.tabs.sendMessage(tab.id, {
    type: "GET_PAGE_STATS",
  });

  return stats?.detectedCount ?? 0;
}

type AppState = {
  loading: boolean;
  isFinnPage: boolean;
  detectedCarsCount: number;
  pinnedCars: Record<number, PinnedFinnCar>;
  /** Which of FINN's two prices the pinned previews quote. */
  contractType: ContractType;
};

function App() {
  const [state, setState] = useState<AppState>({
    loading: true,
    isFinnPage: false,
    detectedCarsCount: 0,
    pinnedCars: {},
    contractType: "private",
  });

  useEffect(() => {
    let alive = true;

    const refreshPinnedCars = async () => {
      try {
        const pinnedCars = await getPinnedCars();
        if (!alive) return;
        setState((prev) => ({ ...prev, pinnedCars }));
      } catch {
        // storage may be briefly unavailable during startup. Ignore.
      }
    };

    const refreshDetectedCount = async () => {
      try {
        const detectedCarsCount = await getDetectedCarsCount();
        if (!alive) return;
        setState((prev) => ({ ...prev, detectedCarsCount }));
      } catch {
        // the active tab may not have the content script available
        // (e.g. it isn't on finn.com). Ignore the failed refresh.
      }
    };

    const handleRuntimeMessage = (message: { type?: string }) => {
      if (message.type !== "CARDS_LOADED" && message.type !== "PINNED_CARS_UPDATED") return;

      refreshPinnedCars();
      refreshDetectedCount();

      setTimeout(() => {
        refreshPinnedCars();
        refreshDetectedCount();
      }, 150);
    };

    browser.runtime.onMessage.addListener(handleRuntimeMessage);

    void loadLensSettings()
      .then(({ preferences }) => {
        if (alive) {
          setState((prev) => ({ ...prev, contractType: preferences.contractType }));
        }
      })
      .catch(() => {
        // Left on the private price, which is the one FINN shows by default.
      });

    (async () => {
      try {
        const isFinn = await checkIfActiveTabIsFinn();

        if (!alive) return;

        setState((prev) => ({ ...prev, isFinnPage: isFinn }));

        await refreshPinnedCars();

        if (isFinn) {
          await refreshDetectedCount();
        }
      } finally {
        if (alive) {
          setState((prev) => ({ ...prev, loading: false }));
        }
      }
    })();

    return () => {
      alive = false;
      browser.runtime.onMessage.removeListener(handleRuntimeMessage);
    };
  }, []);

  const pinnedCarsCount = Object.keys(state.pinnedCars).length;
  const hasPinned = pinnedCarsCount > 0;
  const hasUsableContent = state.isFinnPage || hasPinned;

  let statusLabel = "No cars saved";

  if (state.isFinnPage) {
    statusLabel = `${state.detectedCarsCount} cars on this page`;
  } else if (hasPinned) {
    statusLabel = `${pinnedCarsCount} saved cars`;
  }

  if (state.loading) {
    return (
      /* The popup is a fixed panel rather than a page, so it brings its own
         measurements to the shared shell. */
      <LoadingScreen className="min-h-140 w-full max-w-100 bg-finn-snow">
        Checking current page…
      </LoadingScreen>
    );
  }

  return (
    <main
      className="min-h-140 w-100 mx-auto text-finn-snow bg-finn-cotton"
    >
      {/* hero */}
      <div className="relative isolate overflow-hidden rounded-b-4xl px-5 pb-9 pt-5 text-white sm:px-7 sm:pb-10">
        <div
          className={[
            "absolute inset-0 -z-10 transition-[background] duration-300",
            state.isFinnPage && hasPinned
              ? "bg-linear-to-br from-finn-highlight-navy to-finn-accent-blue"
              : hasPinned
                ? "bg-linear-to-br from-finn-highlight-navy to-finn-accent-blue/80"
                : "bg-linear-to-br from-finn-black to-finn-black"
          ].join(" ")}
        />

        {/* brand row */}
        <header className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
              <img
                src={Logo}
                alt="Finn Lens logo"
                className={`h-11 w-11 object-contain ${BRAND_IDLE_SPIN}`}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-black leading-none tracking-tight">Finn Lens</h1>
              </div>
              <p className="mt-1 text-[11px] text-white/60">Decision helper</p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-full border border-white/20 bg-white/10 p-1.5 text-white/70 backdrop-blur-sm transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            aria-label="Settings"
            onClick={() => openBrowserTab("OPEN_SETTINGS_PAGE")}
          >
            <Settings aria-hidden="true" className="h-4 w-4" />
          </button>
        </header>

        <section className="relative mt-6">
          {state.isFinnPage ? (
            <>
              <h2 className="text-[23px] font-black leading-snug tracking-[-0.03em] sm:text-[26px]">
                Rent or buy according <br />to what matters to you
              </h2>

              <p className="mt-2 text-sm leading-5 text-white/60 sm:text-[15px]">
                Pin cars on finn.com, compare the tradeoffs, and book with confidence.
              </p>
            </>
          ) : hasPinned ? (
            <>
              <h2 className="text-[23px] font-black leading-snug tracking-[-0.03em] sm:text-[26px]">
                Your saved cars <br />are still here
              </h2>

              <p className="mt-2 text-sm leading-5 text-white/60 sm:text-[15px]">
                You're not on finn.com right now, but your pinned cars are ready to compare.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-[23px] font-black leading-snug tracking-[-0.03em] sm:text-[26px]">
                Start finding <br />your next car
              </h2>

              <p className="mt-2 text-sm leading-5 text-white/60 sm:text-[15px]">
                Open finn.com to discover cars and pin the ones worth comparing.
              </p>
            </>
          )}

          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1.5 font-mono font-bold text-[11px] tracking-wide text-white/80 ring-1 ring-white/15">
            <span
              className={`h-2 w-2 rounded-full ${state.isFinnPage
                ? "bg-finn-success"
                : hasPinned
                  ? "bg-finn-accent-blue"
                  : "bg-finn-iron"
                }`}
            />

            {statusLabel}
          </div>
        </section>
      </div>

      {/*
        * Above everything else, because a reader who still needs it needs it
        * before the metrics — and it removes itself the moment they don't.
        */}
      <div className="px-4">
        <GettingStarted pinnedCount={pinnedCarsCount} />
        {/* The chat's search and the kept ones: whatever the reader was last deciding with Lens. */}
        <SearchCard />
      </div>

      {hasUsableContent ? (
        <section className="p-4">
          {state.isFinnPage ? (
            <div className="flex divide-x divide-dashed divide-finn-iron/25 overflow-hidden rounded-[22px] bg-white shadow-sm">
              <MetricCard
                label="Detected"
                value={state.detectedCarsCount}
                helper="on this page"
                accent={hasPinned}
              />

              <MetricCard
                label="Pinned"
                value={pinnedCarsCount}
                helper="ready to compare"
                accent={hasPinned}
              />
            </div>
          ) : (
            <div className="flex flex-col py-4 sm:py-5 rounded-[22px] bg-white px-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-finn-pale-blue text-lg font-black text-finn-accent-blue">
                  {pinnedCarsCount}
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-finn-iron">
                    Saved cars
                  </p>
                  <p className="mt-1 text-sm font-semibold text-finn-black">
                    Your pinned cars are ready
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs leading-4 text-finn-iron">
                You can review and compare your saved cars even when you're away from finn.com.
              </p>
            </div>
          )}

          <Tabs
            pinnedCount={pinnedCarsCount}
            pinnedCars={state.pinnedCars}
            contractType={state.contractType}
            accent={hasPinned}
          />

          <footer className="py-5 text-center text-[11px] leading-4 text-finn-iron">
            Finn Lens is unofficial and not affiliated with{" "}
            <a
              href={FINN_BASE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-finn-accent-blue underline underline-offset-2"
            >
              finn.com
            </a>.
          </footer>
        </section>
      ) : (
        <GoToFinnSection />
      )}
    </main>
  );
}

export default App;