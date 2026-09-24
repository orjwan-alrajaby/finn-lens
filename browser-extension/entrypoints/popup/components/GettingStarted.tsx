import { useEffect, useState } from "react";
import { CircleCheck, X } from "lucide-react";

import { FINN_BASE_URL } from "@/lib/constants";
import {
    dismissChecklist,
    loadOnboardingState,
    type OnboardingState,
} from "@/lib/onboarding";
import { hasSavedLensSettings } from "@/lib/reasoning-engine";
import { withFinnLinks } from "@/components/FinnLink";
import { openBrowserTab } from "@/lib/utils";
import { loadSession } from "@/lib/lens-chat/session";

/**
 * The three things standing between a new reader and the product working.
 *
 * The popup is where someone goes when they have installed an extension and
 * do not know what to do with it, and until now it answered that with a
 * status readout. This answers it with the path: tell Lens what matters, pin
 * two cars, read the advice. Each one is a click from here and each shows
 * whether it is done.
 *
 * Every line is derived, never a stored copy — it asks the real source
 * whether it is satisfied. That matters because all three can be completed
 * from somewhere else entirely, and a checklist still demanding something
 * the reader has already done is worse than no checklist at all.
 *
 * It disappears on its own once all three are done, and can be closed by
 * hand before that. Neither is recoverable from the popup, which is right: a
 * reader past this point has a product, not a tutorial.
 */
export function GettingStarted({ pinnedCount }: { pinnedCount: number }) {
    const [state, setState] = useState<OnboardingState | null>(null);
    const [configured, setConfigured] = useState(false);
    /* A search built with Lens on finn.com is a way to a recommendation too. */
    const [searched, setSearched] = useState(false);
    const [closed, setClosed] = useState(false);

    useEffect(() => {
        let alive = true;

        void (async () => {
            const [onboarding, saved, session] = await Promise.all([
                loadOnboardingState(),
                hasSavedLensSettings().catch(() => false),
                loadSession().catch(() => null),
            ]);

            if (!alive) return;

            setState(onboarding);
            setConfigured(saved);
            setSearched(Boolean(session));
        })();

        return () => {
            alive = false;
        };
    }, []);

    if (!state || closed || state.checklistDismissed) return null;

    const tasks: Task[] = [
        {
            id: "priorities",
            done: configured,
            label: "Make Lens yours",
            /*
             * Not "set Lens up" any more. It already works — on its own
             * defaults — so calling this setup would be describing a blocked
             * product that isn't blocked. What it actually offers is the
             * difference between Lens's assumptions and the reader's.
             */
            todo: "Lens is using its own defaults. Swap them for what matters to you — about a minute, once.",
            doneNote: "Lens is using your answers.",
            action: "Personalise",
            onClick: () => void openBrowserTab("OPEN_ONBOARDING_PAGE"),
        },
        {
            id: "pin",
            /*
             * Either route gives Lens cars to compare: pinning two, or asking
             * Lens on a listing, which compares the cars there. The step was
             * written when pinning was the only way.
             */
            done: pinnedCount >= 2 || searched,
            label: "Pin two cars, or ask Lens on finn.com",
            todo:
                pinnedCount === 1
                    ? "One pinned. Pin another, or open Ask Lens on a listing to compare the cars there."
                    : withFinnLinks(
                          "Lens adds a pin button to every car on finn.com, and Ask Lens compares the cars on any listing.",
                      ),
            doneNote: searched && pinnedCount < 2 ? "Your chat with Lens compared the cars on a listing." : `${pinnedCount} cars pinned and ready.`,
            action: "Open finn.com",
            onClick: () => window.open(FINN_BASE_URL, "_blank", "noopener"),
        },
        {
            id: "advice",
            done: state.seenAdvice,
            label: "Read your first recommendation",
            todo: "One car, the reasons for it, and what it really costs.",
            doneNote: "You've seen what Lens can do.",
            action: "Open Lens",
            onClick: () => void openBrowserTab("OPEN_COMPARE_PAGE"),
        },
    ];

    const complete = tasks.filter((task) => task.done).length;

    /* Nothing left to say — the checklist retires itself. */
    if (complete === tasks.length) return null;

    /* The first thing not yet done is the only one offering a button. */
    const nextTask = tasks.find((task) => !task.done);

    const close = () => {
        setClosed(true);
        void dismissChecklist();
    };

    return (
        <section className="mt-4 rounded-[22px] bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-black text-finn-black">
                        Getting started
                    </p>

                    <p className="mt-0.5 text-[11px] leading-4 text-finn-iron">
                        {complete} of {tasks.length} done — you only do this
                        once.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={close}
                    aria-label="Hide getting started"
                    className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-finn-iron transition hover:bg-finn-snow hover:text-finn-black"
                >
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
            </div>

            <div className="mt-2.5 flex gap-1">
                {tasks.map((task) => (
                    <span
                        key={task.id}
                        className={[
                            "h-1.5 flex-1 rounded-full",
                            task.done
                                ? "bg-finn-accent-blue"
                                : "bg-finn-cotton",
                        ].join(" ")}
                    />
                ))}
            </div>

            <ol className="mt-3 flex flex-col gap-2">
                {tasks.map((task, index) => (
                    <TaskRow
                        key={task.id}
                        task={task}
                        index={index}
                        isNext={task.id === nextTask?.id}
                    />
                ))}
            </ol>
        </section>
    );
}

interface Task {
    id: string;
    done: boolean;
    label: string;
    /** What to say while it is still outstanding. */
    todo: React.ReactNode;
    /** What to say once it is done — a fact, not a congratulation. */
    doneNote: string;
    action: string;
    onClick: () => void;
}

function TaskRow({
    task,
    index,
    isNext,
}: {
    task: Task;
    index: number;
    /** The first outstanding task, and the only one carrying a button. */
    isNext: boolean;
}) {
    return (
        <li
            className={[
                "flex items-start gap-2.5 rounded-2xl px-3 py-2.5 transition",
                isNext ? "bg-finn-pale-blue" : "",
            ].join(" ")}
        >
            {task.done ? (
                <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 fill-finn-accent-blue text-white" />
            ) : (
                <span
                    className={[
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-black",
                        isNext
                            ? "bg-finn-accent-blue text-white"
                            : "bg-finn-cotton text-finn-iron",
                    ].join(" ")}
                >
                    {index + 1}
                </span>
            )}

            <span className="min-w-0 flex-1">
                <span
                    className={[
                        "block text-[11px] font-bold leading-4",
                        task.done
                            ? "text-finn-iron line-through"
                            : "text-finn-black",
                    ].join(" ")}
                >
                    {task.label}
                </span>

                <span className="mt-0.5 block text-[10px] leading-4 text-finn-iron">
                    {task.done ? task.doneNote : task.todo}
                </span>
            </span>

            {isNext && (
                <button
                    type="button"
                    onClick={task.onClick}
                    className="shrink-0 rounded-full bg-finn-accent-blue px-3 py-1.5 text-[10px] font-black text-white transition hover:bg-finn-highlight-navy"
                >
                    {task.action}
                </button>
            )}
        </li>
    );
}
