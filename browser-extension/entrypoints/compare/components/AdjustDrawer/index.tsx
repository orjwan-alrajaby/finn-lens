import { useEffect, useMemo, useState } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import * as Dialog from "@radix-ui/react-dialog";
import { Settings, X } from "lucide-react";

import { isCustomisedFrom, saveLensSettings } from "@/lib/reasoning-engine";
import type {
    CategoryId,
    LensPreferences,
    ProfileId,
} from "@/lib/reasoning-engine/types";
import { DRAWER_SHELL } from "@/components/drawer";
import {
    closeInfoPanel,
    InfoPanelHost,
    type InfoPanelHostValue,
} from "@/components/PriorityInfo";
import { SaveControl } from "@/components/SaveControl";

import { type Answers, useCompareStore } from "../../store";
import {
    clearFeatures,
    featuresChanged,
    restoreSavedFeatures,
    sameAnswers,
    setFeatureImportance,
    startFromProfile,
    toggleFeature,
} from "./draft";
import { AssumptionsSection } from "./AssumptionsSection";
import { FeatureSection } from "./FeatureSection";
import { PriorityOrderSection } from "./PriorityOrderSection";

/**
 * The questions, over the answer rather than in front of it.
 *
 * These three — the priority order, what counts inside each priority, and
 * what the reader's driving costs — used to be three steps walked before any
 * recommendation existed. That asked someone to tune a thing they had never
 * seen: you cannot tell whether "practicality third" is right until you have
 * watched what third does to the result. So the advice comes first, and this
 * is where it gets argued with.
 *
 * Two things changed here, and they are the same change twice.
 *
 * **It is a drawer now, not a splint.** The page used to give up 27rem of its
 * width whenever this opened, so that a change could be watched landing
 * behind it. In practice it squeezed the advice into a column too narrow to
 * read while the reader worked in a column too narrow to work in, and neither
 * half got the room it needed. It is a proper modal drawer with a backdrop:
 * it overlays the page, it is as wide as it needs to be, and the page it
 * covers is waiting underneath.
 *
 * **Nothing lands until Save.** Every control used to write straight into the
 * store, so the recommendation re-reasoned on each keystroke — which is
 * exactly the behaviour the drawer's own width existed to justify. Once it
 * overlays the page there is nothing to watch, and re-reasoning under a
 * covered page is work nobody asked for. So the drawer holds a draft and
 * commits it in one act, through the same `SaveControl` the settings page
 * uses and saying the same three things: unsaved changes, save, saved.
 *
 * The draft outlives a close on purpose. A reader who shuts the drawer to
 * re-read the advice has not thrown their edits away, and reopening it to
 * find them gone would be the drawer deciding that for them.
 */
export function AdjustDrawer({
    open,
    onOpenChange,
    onSettings,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSettings: () => void;
}) {
    const priorityDefinitions = useCompareStore(
        (state) => state.priorityDefinitions,
    );
    const profiles = useCompareStore((state) => state.profiles);
    const savedPreferences = useCompareStore(
        (state) => state.savedPreferences,
    );
    const savedCategoryFeatures = useCompareStore(
        (state) => state.savedCategoryFeatures,
    );
    const applyAnswers = useCompareStore((state) => state.applyAnswers);

    /*
     * What the page is currently reasoning from, as one object — that being
     * what a draft is compared against and what a save replaces.
     *
     * Selected field by field and assembled here rather than returned whole
     * from one selector. Zustand compares snapshots by identity, so a
     * selector building `{ priorities, preferences, features }` hands back a
     * different object on every call and the store never settles.
     */
    const priorities = useCompareStore((state) => state.priorities);
    const preferences = useCompareStore((state) => state.preferences);
    const features = useCompareStore((state) => state.features);
    const basedOn = useCompareStore((state) => state.basedOn);

    const applied: Answers = useMemo(
        () => ({ priorities, preferences, features, basedOn }),
        [priorities, preferences, features, basedOn],
    );

    /*
     * Seeded once. The page holds this drawer back until the saved settings
     * have been read, so there is no window in which the defaults could be
     * captured as the reader's answers.
     */
    const [draft, setDraft] = useState<Answers>(applied);
    const [expanded, setExpanded] = useState<CategoryId | null>(
        applied.priorities[0] ?? null,
    );
    const [saved, setSaved] = useState(false);

    /*
     * What a profile just replaced, for its one-tap undo. Any other edit
     * clears it: the undo belongs to the apply, not to a history.
     */
    const [beforeProfile, setBeforeProfile] = useState<Answers | null>(null);

    const edit = (change: (current: Answers) => Answers) => {
        setBeforeProfile(null);
        setDraft(change);
    };

    /*
     * The drawer's own element, so the "i" panels the priority list opens can
     * mount inside it. This is a modal dialog: anything portalled to the body
     * lands outside its scroll lock and its focus trap, which for a panel
     * with a scrolling body means one that cannot be scrolled or reached.
     */
    const [content, setContent] = useState<HTMLDivElement | null>(null);

    /*
     * The "i" on a priority or profile in here opens its explanation as a
     * page of this drawer, with a way back to the answers, rather than as a
     * second drawer stacked over this one — see `InfoPanelHost`.
     */
    const infoHost: InfoPanelHostValue = useMemo(
        () => ({ placement: "inside", container: content }),
        [content],
    );

    /* An explanation of something in the drawer goes when the drawer does. */
    useEffect(() => {
        if (!open) closeInfoPanel();
    }, [open]);

    const dirty = !sameAnswers(draft, applied);

    const customised = isCustomisedFrom(
        { priorities: draft.priorities, categoryFeatures: draft.features },
        draft.basedOn,
    );

    const save = () => {
        applyAnswers(draft);
        setBeforeProfile(null);

        setSaved(true);
        window.setTimeout(() => setSaved(false), 1800);
    };

    const followOrder = (priorities: CategoryId[]) => {
        /*
         * The feature editor stays open on a priority the reader still has.
         * Leaving a card open for a category they just dropped would leave
         * that part of the drawer showing nothing at all.
         */
        setExpanded((current) =>
            current && priorities.includes(current)
                ? current
                : (priorities[0] ?? null),
        );
    };

    const setPriorities = (priorities: CategoryId[]) => {
        edit((current) => ({ ...current, priorities }));
        followOrder(priorities);
    };

    const chooseProfile = (profile: ProfileId) => {
        setBeforeProfile(draft);

        const next = startFromProfile(draft, profile);

        setDraft(next);
        followOrder(next.priorities);
    };

    const undoProfile = () => {
        if (!beforeProfile) return;

        setDraft(beforeProfile);
        followOrder(beforeProfile.priorities);
        setBeforeProfile(null);
    };

    const setPreferences = (preferences: LensPreferences) => {
        setDraft((current) => ({ ...current, preferences }));
    };

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="finn-lens-scrim fixed inset-0 z-40 bg-finn-black/40 backdrop-blur-[2px]" />

                <Dialog.Content
                    ref={setContent}
                    aria-describedby="adjust-drawer-purpose"
                    className={[
                        DRAWER_SHELL,
                        "z-50 max-w-[min(100vw,46rem)] bg-finn-snow",
                    ].join(" ")}
                >
                    <InfoPanelHost.Provider value={infoHost}>
                        <Header onSettings={onSettings} />

                        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                            {/*
                              * `multiple`, and every section open to begin with:
                              * the reader came here to change something and does
                              * not yet know which of the three it is.
                              */}
                            <Accordion.Root
                                type="multiple"
                                defaultValue={["order", "features", "driving"]}
                                className="flex flex-col gap-3"
                            >
                                <PriorityOrderSection
                                    priorities={draft.priorities}
                                    priorityDefinitions={priorityDefinitions}
                                    profiles={profiles}
                                    features={draft.features}
                                    basedOn={draft.basedOn}
                                    customised={customised}
                                    onChange={setPriorities}
                                    onApplyProfile={chooseProfile}
                                    onUndoProfile={
                                        beforeProfile ? undoProfile : null
                                    }
                                />

                                <FeatureSection
                                    priorities={draft.priorities}
                                    features={draft.features}
                                    savedCategoryFeatures={savedCategoryFeatures}
                                    expanded={expanded}
                                    onExpandedChange={setExpanded}
                                    changed={featuresChanged(
                                        draft,
                                        savedCategoryFeatures,
                                    )}
                                    basedOn={draft.basedOn}
                                    customised={customised}
                                    profiles={profiles}
                                    onToggleFeature={(category, feature) =>
                                        edit((current) =>
                                            toggleFeature(
                                                current,
                                                category,
                                                feature,
                                            ),
                                        )
                                    }
                                    onImportanceChange={(
                                        category,
                                        feature,
                                        importance,
                                    ) =>
                                        edit((current) =>
                                            setFeatureImportance(
                                                current,
                                                category,
                                                feature,
                                                importance,
                                            ),
                                        )
                                    }
                                    onClearCategory={(category) =>
                                        edit((current) =>
                                            clearFeatures(current, category),
                                        )
                                    }
                                    onRestoreSaved={() =>
                                        edit((current) =>
                                            restoreSavedFeatures(
                                                current,
                                                savedCategoryFeatures,
                                            ),
                                        )
                                    }
                                />

                                <AssumptionsSection
                                    preferences={draft.preferences}
                                    savedPreferences={savedPreferences}
                                    onChange={setPreferences}
                                    onUseSaved={() =>
                                        setPreferences({ ...savedPreferences })
                                    }
                                />
                            </Accordion.Root>
                        </div>

                        <Footer
                            dirty={dirty}
                            saved={saved}
                            onSave={save}
                            onSettings={onSettings}
                        />
                    </InfoPanelHost.Provider>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

function Header({ onSettings }: { onSettings: () => void }) {
    return (
        <header className="flex items-start justify-between gap-3 border-b border-finn-cotton bg-white px-4 py-4 sm:px-6">
            <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-finn-accent-blue">
                    Adjust
                </p>

                <Dialog.Title className="mt-1 text-base font-black text-finn-black">
                    Change an answer, then save it
                </Dialog.Title>

                <Dialog.Description
                    id="adjust-drawer-purpose"
                    className="mt-1 text-[11px] leading-4 text-finn-iron"
                >
                    Nothing here changes your recommendation until you save —
                    so you can try a few things out first.
                </Dialog.Description>
            </div>

            <div className="flex shrink-0 items-center gap-1">
                <button
                    type="button"
                    onClick={onSettings}
                    className="hidden h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-bold text-finn-iron transition hover:bg-finn-snow hover:text-finn-black sm:inline-flex"
                >
                    <Settings aria-hidden="true" className="h-3.5 w-3.5" />
                    Settings
                </button>

                <Dialog.Close
                    aria-label="Close"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-finn-iron transition hover:bg-finn-snow hover:text-finn-black"
                >
                    <X aria-hidden="true" className="h-5 w-5" />
                </Dialog.Close>
            </div>
        </header>
    );
}

/**
 * The save, and the one thing a reader needs told about it: what survives
 * past this comparison and what doesn't.
 */
function Footer({
    dirty,
    saved,
    onSave,
    onSettings,
}: {
    dirty: boolean;
    saved: boolean;
    onSave: () => void;
    onSettings: () => void;
}) {
    const answersFrom = useCompareStore((state) => state.answersFrom);
    const [kept, setKept] = useState(false);

    /* What the page is running now — applied answers, not an unsaved draft. */
    const keepAsSettings = () => {
        const { priorities, preferences, features, basedOn } = useCompareStore.getState();

        void saveLensSettings({ priorities, preferences, categoryFeatures: features, basedOn }).then(() => setKept(true));
    };

    return (
        <footer className="flex flex-col-reverse gap-3 border-t border-finn-cotton bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            {answersFrom.kind === "search" ? (
                /*
                 * Adjusting a search is adjusting that search. It used to
                 * write the order into the reader's saved settings like any
                 * other change here — which then judged every badge on
                 * finn.com. Keeping it is now the reader's own act.
                 */
                <p className="text-[11px] leading-4 text-finn-iron">
                    You're adjusting “{answersFrom.name}”, for this page only. Your saved settings stay as they are —{" "}
                    <button
                        type="button"
                        onClick={keepAsSettings}
                        disabled={kept}
                        className="inline-flex items-center gap-1 font-bold text-finn-accent-blue underline-offset-2 transition hover:underline disabled:no-underline disabled:opacity-70"
                    >
                        <Settings aria-hidden="true" className="h-3 w-3" />
                        {kept ? "saved as your settings" : "save these as my settings"}
                    </button>
                    .
                </p>
            ) : (
                <p className="text-[11px] leading-4 text-finn-iron">
                    Your order is kept for next time. Everything else applies to
                    this comparison only —{" "}
                    <button
                        type="button"
                        onClick={onSettings}
                        className="inline-flex items-center gap-1 font-bold text-finn-accent-blue underline-offset-2 transition hover:underline"
                    >
                        <Settings aria-hidden="true" className="h-3 w-3" />
                        make it permanent in Settings
                    </button>
                    .
                </p>
            )}

            <SaveControl
                dirty={dirty}
                saved={saved}
                onSave={onSave}
                saveLabel="Apply changes"
                className="shrink-0 justify-end"
            />
        </footer>
    );
}
