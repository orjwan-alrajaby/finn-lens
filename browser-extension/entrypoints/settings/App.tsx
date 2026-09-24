import "@/assets/tailwind.css";
import { useEffect, useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
    ArrowLeft,
    GraduationCap,
    RotateCcw,
} from "lucide-react";
import { NavButton, PageHeader } from "@/components/PageHeader";
import { LoadingScreen } from "@/components/Spinner";
import {
  DEFAULT_CATEGORY_FEATURES,
  DEFAULT_DEFAULT_PROFILE_ID,
  DEFAULT_PREFERENCES,
  DEFAULT_PRIORITIES,
  DEFAULT_PRIORITY_DEFINITIONS,
  DEFAULT_PROFILES,
} from "@/lib/reasoning-engine/constants";
import {
  applyProfile,
  isCustomisedFrom,
  loadLensSettings,
  saveLensSettings,
  unregisterCategoryMeta,
} from "@/lib/reasoning-engine";
import type {
  CategoryId,
  FeatureSelection,
  LensPreferences,
  LensSettings,
  PriorityDefinition,
  Profile,
  ProfileId,
  SettingsBasis,
} from "@/lib/reasoning-engine/types";
import { isSettingsTab, SettingsTabs, type SettingsTab } from "./tabs/SettingsTabs";
import { SearchesSettings } from "./tabs/SearchesSettings";
import { JudgedBy, useJudging } from "@/components/JudgedBy";
import { PrioritiesSettings } from "./tabs/PrioritiesSettings";
import { ProfilesSettings } from "./tabs/ProfileSettings";
import { DrivingSettings } from "./tabs/DrivingSettings";
import { DataSettings } from "./tabs/DataSettings";
import { LensAiSettings } from "./tabs/LensAiSettings";
import {
  DEFAULT_LENS_AI_SETTINGS,
  loadLensAiSettings,
  saveLensAiSettings,
  type LensAiSettings as AiSettings,
} from "@/lib/lens-ai/settings";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { SaveControl } from "@/components/SaveControl";
import { getProfileIssues } from "./utils/PriorityValidation";
import { stableStringify } from "@/lib/stable-stringify";
import { loadPinnedCars, type StoredDataGroupId } from "@/lib/stored-data";
import { openBrowserTab } from "@/lib/utils";

export default function SettingsPage({ onBack }: { onBack?: () => void }) {
  /* Opened on a tab when asked to — "#tab=searches" from the popup. */
  const tabFromHash = (): SettingsTab => {
    const asked = new URLSearchParams(window.location.hash.slice(1)).get("tab") ?? "";

    return isSettingsTab(asked) ? asked : "priorities";
  };
  const [tab, setTab] = useState<SettingsTab>(tabFromHash);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());

    window.addEventListener("hashchange", onHash);

    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const judging = useJudging();
  const [loading, setLoading] = useState(true);

  const [preferences, setPreferences] = useState<LensPreferences>(DEFAULT_PREFERENCES);
  const [priorities, setPriorities] = useState<CategoryId[]>(DEFAULT_PRIORITIES);
  const [priorityDefinitions, setPriorityDefinitions] = useState<PriorityDefinition[]>(DEFAULT_PRIORITY_DEFINITIONS);
  const [categoryFeatures, setCategoryFeatures] = useState<Record<CategoryId, FeatureSelection>>(DEFAULT_CATEGORY_FEATURES);
  const [profiles, setProfiles] = useState<Profile[]>(DEFAULT_PROFILES);
  const [defaultProfileId, setDefaultProfileId] = useState<string>(DEFAULT_DEFAULT_PROFILE_ID);
  const [basedOn, setBasedOn] = useState<SettingsBasis>(DEFAULT_DEFAULT_PROFILE_ID);

  /*
   * What a profile just replaced, for its one-tap undo. Any other edit to the
   * order or the raises clears it: the undo belongs to the apply.
   */
  const [beforeProfile, setBeforeProfile] = useState<{
    priorities: CategoryId[];
    categoryFeatures: Record<CategoryId, FeatureSelection>;
    basedOn: SettingsBasis;
  } | null>(null);

  /*
   * Lens AI is saved with everything else, by the same button, but kept out
   * of `LensSettings`: it's whether a model may be called, not how Lens
   * judges a car, and restoring the defaults shouldn't forget a key.
   */
  const [ai, setAi] = useState<AiSettings>(DEFAULT_LENS_AI_SETTINGS);
  const [persistedAi, setPersistedAi] = useState<string>(stableStringify(DEFAULT_LENS_AI_SETTINGS));

  const [saved, setSaved] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);


  /*
   * What is on disk, as text, so the bar can tell the reader whether what
   * they are looking at is what Lens will actually use. Nothing on this page
   * takes effect until it is saved, and the priority order in particular is
   * now something a reader arrives here specifically to set — leaving them
   * unsure whether they did is the one thing this page must not do.
   */
  const [persisted, setPersisted] = useState<string | null>(null);

  /*
   * Only to know whether the header's Recommendation link has anything behind it.
   * Kept current, since a car pinned on finn.com — or the set deleted from
   * the Data tab — can change the answer while this page is open.
   */
  const [pinnedCount, setPinnedCount] = useState<number | null>(null);

  useEffect(() => {
    const countPins = async () => setPinnedCount((await loadPinnedCars()).length);

    void countPins();

    const listener = (message: { type?: string }) => {
      if (message.type === "PINNED_CARS_UPDATED") void countPins();
    };

    browser.runtime.onMessage.addListener(listener);

    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => {
    void loadLensAiSettings().then((stored) => {
      setAi(stored);
      setPersistedAi(stableStringify(stored));
    });

    loadLensSettings().then((settings) => {
      setPreferences(settings.preferences);
      setPriorities(settings.priorities);
      setPriorityDefinitions(settings.priorityDefinitions);
      setCategoryFeatures(settings.categoryFeatures);
      setProfiles(settings.profiles);
      setDefaultProfileId(settings.defaultProfileId);
      setBasedOn(settings.basedOn);
      setPersisted(stableStringify(settings));
      setLoading(false);
    });
  }, []);

  const flashSaved = () => { setSaved(true); window.setTimeout(() => setSaved(false), 1800); };

  // `priorities` is saved from here now, and that is a change worth naming.
  //
  // It used to be omitted because the compare flow was the only place the
  // order could be set, so writing it from here could only have overwritten a
  // customised order with a profile's. It is now shown on this page and edited
  // directly, so saving it is saving what the reader is looking at. Both
  // places write the same key, which is right: there is one priority order,
  // not a settings one and a compare one.
  const currentSettings = (): LensSettings => ({
    preferences,
    priorities,
    priorityDefinitions,
    categoryFeatures,
    profiles,
    defaultProfileId: defaultProfileId as ProfileId,
    basedOn,
  });

  const save = async () => {
    const settings = currentSettings();

    await saveLensSettings(settings);
    await saveLensAiSettings(ai);

    setPersisted(stableStringify(settings));
    setPersistedAi(stableStringify(ai));
    flashSaved();
  };

  // ── Priorities ──────────────────────────────────────────────────────────

  /*
   * Edits from a priority editor land here as they are made — there is no
   * draft between the picker and this page any more, and so no second Save
   * for a reader to press and be misled by.
   */
  const handleChangeFeatures = (priorityId: CategoryId, features: FeatureSelection) => {
    setBeforeProfile(null);
    setCategoryFeatures((cur) => ({ ...cur, [priorityId]: features }));
  };

  const handleChangePriorities = (next: CategoryId[]) => {
    setBeforeProfile(null);
    setPriorities(next);
  };

  /* A profile replaces the order and the raises together, and can be undone in one tap. */
  const handleApplyProfile = (id: ProfileId) => {
    setBeforeProfile({ priorities, categoryFeatures, basedOn });

    const applied = applyProfile(id);

    setPriorities(applied.priorities);
    setCategoryFeatures(applied.categoryFeatures);
    setBasedOn(applied.basedOn);
  };

  const handleUndoProfile = () => {
    if (!beforeProfile) return;

    setPriorities(beforeProfile.priorities);
    setCategoryFeatures(beforeProfile.categoryFeatures);
    setBasedOn(beforeProfile.basedOn);
    setBeforeProfile(null);
  };

  // ── Profiles ────────────────────────────────────────────────────────────
  //
  // Profiles are product configuration: they can be switched on and off and
  // one of them is the default, but their copy and priority order are fixed.
  // The only thing to guard here is that the default always points at a
  // profile that is actually available.

  const handleToggleProfileEnabled = (id: string, enabled: boolean) => {
    const next = profiles.map((p) => (p.id === id ? { ...p, enabled } : p));

    if (!next.some((p) => p.enabled)) return;

    setProfiles(next);

    if (!enabled && id === defaultProfileId) {
      const replacement = next.find((p) => p.enabled);
      if (replacement) setDefaultProfileId(replacement.id);
    }
  };

  // ── Deleting stored data ────────────────────────────────────────────────

  /**
   * Put the page back in step with storage after something was deleted.
   *
   * This page holds the settings in React state and compares them against a
   * snapshot of what is on disk. Delete the settings from under it and both
   * are stale: the form still shows the values that were just removed, and
   * the save bar would cheerfully offer to write them back — which would
   * undo the deletion by the most confusing route available.
   *
   * Only the settings group needs this. Pinned cars, the browsing cache and
   * the setup record are not on this page, so deleting them changes nothing
   * it is holding.
   */
  const handleDataCleared = (groups: StoredDataGroupId[]) => {
    /* This page never hears its own PINNED_CARS_UPDATED, so it is told here. */
    if (groups.includes("pinnedCars")) setPinnedCount(0);

    if (groups.includes("lensAi")) {
      setAi(DEFAULT_LENS_AI_SETTINGS);
      setPersistedAi(stableStringify(DEFAULT_LENS_AI_SETTINGS));
    }

    if (!groups.includes("settings")) return;

    for (const p of priorityDefinitions) {
      if (p.isCustom) unregisterCategoryMeta(p.id);
    }

    setPreferences(DEFAULT_PREFERENCES);
    setPriorities(DEFAULT_PRIORITIES);
    setPriorityDefinitions(DEFAULT_PRIORITY_DEFINITIONS);
    setCategoryFeatures(DEFAULT_CATEGORY_FEATURES);
    setProfiles(DEFAULT_PROFILES);
    setDefaultProfileId(DEFAULT_DEFAULT_PROFILE_ID);
    setBasedOn(DEFAULT_DEFAULT_PROFILE_ID);
    setBeforeProfile(null);

    /*
     * The snapshot is set to the defaults rather than re-read, because that
     * is exactly what storage now holds: nothing, which `loadLensSettings`
     * reads as the defaults. Saving is left disabled until the reader
     * changes something, so a deletion is not silently written back.
     */
    setPersisted(
      stableStringify({
        preferences: DEFAULT_PREFERENCES,
        priorities: DEFAULT_PRIORITIES,
        priorityDefinitions: DEFAULT_PRIORITY_DEFINITIONS,
        categoryFeatures: DEFAULT_CATEGORY_FEATURES,
        profiles: DEFAULT_PROFILES,
        defaultProfileId: DEFAULT_DEFAULT_PROFILE_ID,
        basedOn: DEFAULT_DEFAULT_PROFILE_ID,
      }),
    );
  };

  // ── Restore defaults ────────────────────────────────────────────────────

  const handleRestoreDefaults = async () => {
    for (const p of priorityDefinitions) {
      if (p.isCustom) unregisterCategoryMeta(p.id);
    }
    setPreferences(DEFAULT_PREFERENCES);
    setPriorities(DEFAULT_PRIORITIES);
    setPriorityDefinitions(DEFAULT_PRIORITY_DEFINITIONS);
    setCategoryFeatures(DEFAULT_CATEGORY_FEATURES);
    setProfiles(DEFAULT_PROFILES);
    setDefaultProfileId(DEFAULT_DEFAULT_PROFILE_ID);
    setBasedOn(DEFAULT_DEFAULT_PROFILE_ID);
    setBeforeProfile(null);
    await saveLensSettings({
      preferences: DEFAULT_PREFERENCES,
      priorities: DEFAULT_PRIORITIES,
      priorityDefinitions: DEFAULT_PRIORITY_DEFINITIONS,
      categoryFeatures: DEFAULT_CATEGORY_FEATURES,
      profiles: DEFAULT_PROFILES,
      defaultProfileId: DEFAULT_DEFAULT_PROFILE_ID,
      basedOn: DEFAULT_DEFAULT_PROFILE_ID,
    });
    setPersisted(
      stableStringify({
        preferences: DEFAULT_PREFERENCES,
        priorities: DEFAULT_PRIORITIES,
        priorityDefinitions: DEFAULT_PRIORITY_DEFINITIONS,
        categoryFeatures: DEFAULT_CATEGORY_FEATURES,
        profiles: DEFAULT_PROFILES,
        defaultProfileId: DEFAULT_DEFAULT_PROFILE_ID,
        basedOn: DEFAULT_DEFAULT_PROFILE_ID,
      }),
    );
    setRestoreOpen(false);
    flashSaved();
  };

  /*
   * Compared as text rather than field by field: everything on this page is
   * plain data, and a deep equality helper would be a second description of
   * the same shape to keep in step with the first.
   */
  const dirty =
    (persisted !== null && stableStringify(currentSettings()) !== persisted) ||
    stableStringify(ai) !== persistedAi;

  const profilesNeedingAttention = profiles.filter((p) => getProfileIssues(p, priorityDefinitions).length > 0).length;

  if (loading) {
    return <LoadingScreen>Loading settings…</LoadingScreen>;
  }

  return (
    <Tooltip.Provider delayDuration={250}>
    <main className="min-h-screen bg-finn-snow text-finn-black">
      {/*
        * Not sticky here, unlike everywhere else: this page's sticky slot is
        * already spoken for by the tabs and the Save button, and two bars
        * competing for the top of the window would cost more than the
        * consistency is worth.
        */}
      <PageHeader current="settings" pinnedCount={pinnedCount} sticky={false}>
        {onBack && (
          <NavButton
            icon={<ArrowLeft aria-hidden="true" className="h-4 w-4" />}
            label="Back"
            onClick={onBack}
          />
        )}
      </PageHeader>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <header className="mb-7">
          <h1 className="text-3xl font-black tracking-tight">Settings</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-finn-iron">
            The priorities, profiles and driving assumptions Finn Lens judges cars by, your kept searches, and optional AI. While
            your chat with Lens has a result, the badges and pages judge by the chat instead — and say so.
          </p>

          {judging && <JudgedBy judging={judging} className="mt-4" />}
        </header>

        {/*
          * Sticky, and carrying the Save button.
          *
          * It used to live in a bar fixed to the bottom of the window, which
          * is a thing a reader stops seeing on the second day — and the one
          * control on this page that has to be seen. Up here it sits beside
          * the tabs, where they already look to move around the page.
          */}
        <div className="sticky top-0 z-30 -mx-4 mb-5 flex flex-col-reverse items-center justify-between gap-3 bg-finn-snow/90 px-4 py-3 backdrop-blur-md xs:flex-row sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
          <SettingsTabs active={tab} onChange={setTab} badges={{ profiles: profilesNeedingAttention }} />
          <div className="flex flex-wrap items-center justify-end gap-3">
            <SaveControl dirty={dirty} saved={saved} onSave={save} />

            {/*
              * The setup flow opens itself once, on install. Anyone who
              * skipped it, or who wants the explanation back, has no other
              * way to reach it — a page that can only be seen by accident of
              * timing may as well not exist.
              */}
            <button type="button" onClick={() => void openBrowserTab("OPEN_ONBOARDING_PAGE")} className="inline-flex items-center gap-1.5 text-xs font-bold text-finn-iron hover:text-finn-black">
              <GraduationCap aria-hidden="true" className="h-3.5 w-3.5" /> Setup guide
            </button>
            <button type="button" onClick={() => setRestoreOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-bold text-finn-iron hover:text-finn-black">
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> Restore defaults
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {tab === "priorities" && (
            <PrioritiesSettings
              priorities={priorities}
              priorityDefinitions={priorityDefinitions}
              categoryFeatures={categoryFeatures}
              profiles={profiles}
              basedOn={basedOn}
              customised={isCustomisedFrom({ priorities, categoryFeatures }, basedOn)}
              onChangePriorities={handleChangePriorities}
              onApplyProfile={handleApplyProfile}
              onUndoProfile={beforeProfile ? handleUndoProfile : null}
              onChangeFeatures={handleChangeFeatures}
            />
          )}
          {tab === "profiles" && (
            <ProfilesSettings
              profiles={profiles}
              priorityDefinitions={priorityDefinitions}
              defaultProfileId={defaultProfileId}
              onToggleEnabled={handleToggleProfileEnabled}
              onSetDefault={setDefaultProfileId}
            />
          )}
          {tab === "driving" && <DrivingSettings preferences={preferences} onChange={setPreferences} />}
          {tab === "searches" && <SearchesSettings />}
          {tab === "ai" && <LensAiSettings settings={ai} onChange={setAi} />}
          {tab === "data" && <DataSettings onCleared={handleDataCleared} />}
        </div>

        {/*
          * The reassurance the bottom bar used to carry, kept because it
          * answers the question a settings page raises and rarely answers:
          * where does this go? It sits at the end of the content rather than
          * over it — it is a fact about the page, not a control.
          */}
        <p className="mt-8 text-center text-[11px] leading-4 text-finn-iron">
          Settings are local to this extension — stored in this browser only,
          with no account behind them. Nothing is sent anywhere unless you turn
          on Lens AI. Changes affect future recommendations.
        </p>
      </div>

      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        eyebrow="All settings"
        title="Restore default settings?"
        confirmLabel="Restore defaults"
        tone="danger"
        onConfirm={handleRestoreDefaults}
        description={
          <>
            <p>
              This puts your priorities, the features you raised, which
              profiles are switched on, the one Lens starts you on, and your
              driving assumptions back to how Finn Lens ships.
            </p>

            <p className="mt-3">
              Any custom priorities or edits you've made will be lost, and it
              can't be undone.
            </p>
          </>
        }
      />
    </main>
    </Tooltip.Provider>
  );
}