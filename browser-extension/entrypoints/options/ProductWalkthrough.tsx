import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
    BookOpen,
    ChevronLeft,
    ChevronRight,
    Maximize2,
    MonitorPlay,
    RotateCcw,
    X,
    ZoomOut,
    CarFront,
    CheckCircle2,
    MessageSquareText,
    Users,
    ZoomIn,
} from "lucide-react";
import meetLens from "@/assets/images/walkthrough/01-meet-lens.webp";
import whoRidesWithYou from "@/assets/images/walkthrough/02-who-rides-with-you.webp";
import whereAndHowYouDrive from "@/assets/images/walkthrough/03-where-and-how-you-drive.webp";
import whatTheCarCopesWith from "@/assets/images/walkthrough/04-what-the-car-copes-with.webp";
import recommendedComforts from "@/assets/images/walkthrough/05-recommended-comforts.webp";
import whatElseMatters from "@/assets/images/walkthrough/06-what-else-matters.webp";
import dealBreakersAndSealers from "@/assets/images/walkthrough/07-deal-breakers-and-sealers.webp";
import allWheelDriveTip from "@/assets/images/walkthrough/08-all-wheel-drive-tip.webp";
import summaryOfAnswers from "@/assets/images/walkthrough/09-summary-of-answers.webp";
import confirmTheSummary from "@/assets/images/walkthrough/10-confirm-the-summary.webp";
import adjustPanel from "@/assets/images/walkthrough/11-adjust-panel.webp";
import saveSettings from "@/assets/images/walkthrough/12-save-settings.webp";
import resultChips from "@/assets/images/walkthrough/13-result-chips.webp";
import resultDrawer from "@/assets/images/walkthrough/14-result-drawer.webp";

import { OnThisPage, useActiveSection, useScrollToHash } from "./OnThisPage";
import { PageIntro } from "./PageIntro";

const SECTIONS = [
    { id: "demo-meet-lens", number: "01", label: "Meet Lens" },
    { id: "demo-tell-lens", number: "02", label: "Tell Lens about your life" },
    {
        id: "demo-review-understanding",
        number: "03",
        label: "Review and refine Lens's understanding",
    },
    { id: "demo-explore-results", number: "04", label: "Explore your results" },
];

const GROUPS = [{ items: SECTIONS }];
const SECTION_IDS = SECTIONS.map((section) => section.id);

/** Every screenshot, in the order the page shows them: the lightbox steps through them in this order. */
const GALLERY: { src: string; alt: string }[] = [
    { src: meetLens, alt: "Finn Lens introduction" },
    { src: whoRidesWithYou, alt: "Passenger and child-seat questions" },
    { src: whereAndHowYouDrive, alt: "Driving habits and parking questions" },
    { src: whatTheCarCopesWith, alt: "Weather and carrying requirements" },
    { src: recommendedComforts, alt: "Comfort preferences and recommended features" },
    { src: whatElseMatters, alt: "Additional preferences and natural-language summary" },
    { src: dealBreakersAndSealers, alt: "Colour-coded choices and explanations" },
    { src: allWheelDriveTip, alt: "All-wheel-drive explanation" },
    { src: summaryOfAnswers, alt: "Summary of answers and priorities" },
    { src: confirmTheSummary, alt: "Prompt to confirm the summary" },
    { src: adjustPanel, alt: "Editable summary and adjustment panel" },
    { src: saveSettings, alt: "Save settings prompt" },
    { src: resultChips, alt: "Finn Lens results and fit indicators" },
    { src: resultDrawer, alt: "Detailed breakdown of a car's evaluation" },
];

/** Opens the lightbox on a screenshot. */
const OpenScreenshot = createContext<(src: string) => void>(() => {});

export function ProductWalkthrough() {
    const active = useActiveSection(SECTION_IDS);
    useScrollToHash();
    /** The screenshot open in the lightbox, by its place in GALLERY. */
    const [open, setOpen] = useState<number | null>(null);

    return (
        <OpenScreenshot.Provider value={(src) => setOpen(GALLERY.findIndex((shot) => shot.src === src))}>
            <div className="relative space-y-4">
                {/* The contents, pinned in the margin where the window is wide enough to have one. */}
                <aside className="absolute top-0 right-full mr-10 hidden h-full w-52 xl:block">
                    <div className="sticky top-8">
                        <OnThisPage groups={GROUPS} active={active} variant="rail" />
                    </div>
                </aside>

                <PageIntro icon={<MonitorPlay />} eyebrow="Product demo" title="Product walkthrough">
                    <p>
                        This walkthrough follows the user's journey through Finn Lens, from figuring out what matters to them to understanding how the
                        available cars compare. Click any screenshot to see it full size.
                    </p>
                </PageIntro>

                {/* Table of contents, where there's no margin for it */}
                <div className="xl:hidden">
                    <OnThisPage groups={GROUPS} active={active} variant="inline" />
                </div>

                {/* 1. Meet Lens */}
                <section id="demo-meet-lens" className="scroll-mt-6">
                    <SectionCard
                        number="1"
                        title="Meet Lens"
                        icon={<MessageSquareText />}
                    >
                        <p>
                            When you first install Finn Lens, it opens the listings
                            page on finn.com and introduces itself through the chat.
                        </p>

                        <Screenshot src={meetLens} alt="Finn Lens introduction" />

                        <p>
                            Lens explains what it does, how the conversation works,
                            and what to expect from the results. You can answer by
                            selecting options or, where a question allows it, entering a
                            value of your own.
                        </p>

                        <p>
                            The idea is straightforward: before judging the cars,
                            Lens wants to understand the person choosing them.
                        </p>
                    </SectionCard>
                </section>

                {/* 2. Tell Lens about your life */}
                <section id="demo-tell-lens" className="scroll-mt-6">
                    <SectionCard
                        number="2"
                        title="Tell Lens about your life"
                        icon={<Users />}
                    >
                        <p>
                            The conversation consists of questions and follow-up
                            questions. Your answers help Lens build a picture of your
                            circumstances, identify relevant vehicle features, and
                            determine which preferences matter most.
                        </p>

                        <Subsection title="2.1. Who rides with you?">
                            <Screenshot src={whoRidesWithYou} alt="Passenger and child-seat questions" />
                            <p>
                                Lens starts by asking who regularly travels with you.
                                Children in child seats, older passengers, teenagers,
                                and dogs can have different implications for what
                                makes a car suitable.
                            </p>

                            <p>
                                Some answers lead to follow-up questions. For example,
                                selecting children prompts you to specify the kind of
                                child seat you need.
                            </p>

                            <p>
                                Lens also explains what it will check and why. In this
                                example, it identifies rear doors as relevant and
                                checks for ISOFIX child-seat anchors.
                            </p>

                            <p>
                                The information icon provides additional context, so
                                users can understand what an answer means to Lens
                                rather than simply selecting an option and hoping
                                for the best.
                            </p>
                        </Subsection>

                        <Subsection title="2.2. Where and how do you drive?">
                            <Screenshot src={whereAndHowYouDrive} alt="Driving habits and parking questions" />
                            <p>
                                Next, Lens asks about your driving habits and the
                                environments you regularly encounter.
                            </p>

                            <p>
                                City driving, traffic, long-distance journeys, and
                                parking situations can all affect which features are
                                useful to you.
                            </p>

                            <p>
                                Some answers lead to more specific questions.
                                Selecting city driving, for example, lets you describe
                                where you usually park.
                            </p>

                            <p>
                                Lens then connects those answers to relevant vehicle
                                features. In the open-car-park example, it explains
                                that reversing out of a parking space into traffic is
                                a situation where rear cross-traffic alert may be
                                useful.
                            </p>

                            <p>
                                The purpose isn't to recommend every available
                                driver-assistance feature. It's to identify the ones
                                that make sense for your circumstances.
                            </p>
                        </Subsection>

                        <Subsection title="2.3. What does the car need to cope with?">
                            <Screenshot src={whatTheCarCopesWith} alt="Weather and carrying requirements" />
                            <p>
                                Lens also asks about the conditions the car needs to
                                handle and what you regularly carry.
                            </p>

                            <p>
                                For example, someone dealing with cold winters, snow
                                and ice may benefit from different equipment than
                                someone primarily driving in hot weather. Similarly,
                                carrying shopping is different from regularly
                                transporting bulky items, bikes, or other equipment.
                            </p>

                            <p>
                                Follow-up questions help Lens narrow down the relevant
                                requirements.
                            </p>

                            <p>
                                If you select hot summers, for instance, Lens explains
                                that it will check for ventilated seats, consider
                                three-zone climate control, and check for air
                                conditioning.
                            </p>

                            <p>
                                These explanations make the connection between your
                                answers and the vehicle features Lens evaluates more
                                explicit.
                            </p>
                        </Subsection>

                        <Subsection title="2.4. Build on earlier answers">
                            <Screenshot src={recommendedComforts} alt="Comfort preferences and recommended features" />
                            <p>
                                As the conversation progresses, Lens can recommend
                                additional options based on what you've already told
                                it.
                            </p>

                            <p>
                                In this example, I indicated that I experience cold
                                winters with snow and ice and spend considerable time
                                driving. When I reached the comfort preferences, Lens
                                recommended a heated steering wheel.
                            </p>

                            <p>The tooltip explains why:</p>

                            <blockquote className="rounded-r-xl border-l-[3px] border-[#0072ea] bg-[#edf5ff] px-4 py-3 text-[13.5px] leading-relaxed text-[#17243b]/85">
                                Recommended because you said winters bring snow and
                                ice, winters are cold, and you spend a lot of time on
                                the road.
                            </blockquote>

                            <p>
                                This is an important distinction. Lens isn't merely
                                presenting a static list of features for the user to
                                select. It uses earlier answers to suggest features
                                that may be relevant to the user's circumstances.
                            </p>

                            <p>
                                The user remains in control, though. A recommendation
                                is a suggestion, not an obligation to include that
                                feature in their priorities.
                            </p>
                        </Subsection>

                        <Subsection title="2.5. Tell Lens what else matters to you">
                            <Screenshot src={whatElseMatters} alt="Additional preferences and natural-language summary" />
                            <p>
                                Beyond practical requirements, Lens asks about other
                                preferences, including comfort and environmental
                                considerations.
                            </p>

                            <p>
                                You can choose specific comfort features and say how
                                green the car should be.
                                Lens also asks about your budget and how long you need
                                the car.
                            </p>

                            <p>It then recounts your answers in natural language.</p>

                            <p>For example, the conversation might look like this:</p>

                            <div className="space-y-3 rounded-xl border border-[#e8e5df] bg-[#faf9f6] p-4 text-[13.5px] leading-relaxed text-[#17243b]/85">
                                <p>
                                    <strong>You:</strong> Comfort matters to me —
                                    ventilated seats, lumbar support and premium
                                    sound. I care about the environment — clean for
                                    its fuel type.
                                </p>

                                <p>
                                    <strong>Lens:</strong> Got it — comfort matters
                                    to you and you care about the environment.
                                </p>
                            </div>

                            <p>
                                Budget and rental duration are handled separately
                                from these preferences. In this example, Lens
                                interprets a monthly budget of €700 as a constraint
                                and works out the rental term needed to cover the
                                requested period.
                            </p>

                            <p>
                                This distinction matters: a preference helps Lens
                                compare suitable cars, while a hard constraint can
                                rule out a car that doesn't meet the requirement.
                            </p>
                        </Subsection>

                        <Subsection title="2.6. Understand the choices Lens recommends">
                            <Screenshot src={dealBreakersAndSealers} alt="Colour-coded choices and explanations" />
                            <p>
                                Lens uses visual indicators to distinguish different
                                kinds of choices, and the information tooltips
                                explain what individual options mean and why they may
                                be relevant.
                            </p>

                            <p>
                                For example, if you've indicated that you regularly
                                encounter snow and ice, Lens may recommend
                                considering all-wheel drive (AWD).
                            </p>
                            <Screenshot src={allWheelDriveTip} alt="All-wheel-drive explanation" />
                            <p>
                                The tooltip explains the trade-off: AWD can improve
                                traction when accelerating on snow, but it doesn't
                                improve braking on snow or replace appropriate winter
                                tyres.
                            </p>

                            <p>
                                The source link provides supporting information for
                                the claim, allowing users to inspect the reasoning
                                rather than having to take Lens's word for it.
                            </p>

                            <p>
                                The point isn't that every recommendation will be
                                right for every person. It's that the recommendation
                                should come with enough context for the user to
                                decide whether it makes sense.
                            </p>
                        </Subsection>
                    </SectionCard>
                </section>

                {/* 3. Review and refine */}
                <section
                    id="demo-review-understanding"
                    className="scroll-mt-6"
                >
                    <SectionCard
                        number="3"
                        title="Review and refine Lens's understanding"
                        icon={<CheckCircle2 />}
                    >
                        <p>
                            Before evaluating the cars, Lens summarizes what it has
                            learned from the conversation.
                        </p>

                        <Subsection title="3.1. See how your answers are interpreted">
                            <Screenshot src={summaryOfAnswers} alt="Summary of answers and priorities" />
                            <p>
                                The summary brings together your answers, the
                                requirements Lens derived from them, and the relative
                                importance assigned to your preferences.
                            </p>

                            <p>The priority levels work as follows:</p>

                            <ul className="list-disc space-y-2 pl-5">
                                <li>
                                    <strong>Top priority (4):</strong> Counts twice
                                    as much as Important. A car can still win without
                                    meeting a top priority, but it needs to
                                    compensate by performing better elsewhere.
                                </li>
                                <li>
                                    <strong>Important (2):</strong> Receives the
                                    standard priority weight and contributes fully to
                                    the comparison.
                                </li>
                                <li>
                                    <strong>Nice to have (1):</strong> Counts half as
                                    much as Important and can help distinguish
                                    between otherwise similar cars.
                                </li>
                            </ul>

                            <p>
                                A dashed outline on how much something counts marks
                                Lens's own guess from your answers, rather than a level
                                you picked yourself.
                            </p>

                            <p>
                                This distinction helps you identify where Lens is
                                interpreting your needs instead of simply recording
                                your choices.
                            </p>
                        </Subsection>

                        <Subsection title="3.2. Confirm or correct the summary">
                            <Screenshot src={confirmTheSummary} alt="Prompt to confirm the summary" />
                            <p>
                                Once the summary is ready, Lens asks whether its
                                understanding looks right or needs adjustment.
                            </p>

                            <p>
                                If something is wrong, you can select the option
                                indicating that the summary doesn't look right.
                            </p>
                            <Screenshot src={adjustPanel} alt="Editable summary and adjustment panel" />
                            <p>
                                The adjustment panel presents the same underlying
                                information in an editable form. You can review the
                                questions and answers, the requirements Lens derived
                                from them, and how it interpreted their importance.
                            </p>

                            <p>
                                You can then adjust the selections until the summary
                                better reflects what you actually meant.
                            </p>

                            <p>
                                This is deliberate: Lens should give users an
                                opportunity to correct its interpretation before
                                using that interpretation to evaluate cars.
                            </p>
                        </Subsection>

                        <Subsection title="3.3. Decide whether to save your settings">
                            <Screenshot src={saveSettings} alt="Save settings prompt" />
                            <p>
                                Once you've confirmed your answers, Lens asks whether
                                you'd like to save them as your settings or use them
                                only for the current conversation.
                            </p>

                            <p>
                                Saved settings provide a starting point for future
                                chats, so you don't have to repeat the entire process
                                each time. You can still change your answers in a
                                future conversation, and you can review or forget
                                your saved settings through Settings.
                            </p>

                            <p>
                                Choosing to use the answers only for the current chat
                                lets you proceed without saving them as your default
                                preferences.
                            </p>
                        </Subsection>
                    </SectionCard>
                </section>

                {/* 4. Explore your results */}
                <section id="demo-explore-results" className="scroll-mt-6">
                    <SectionCard
                        number="4"
                        title="Explore your results"
                        icon={<CarFront />}
                    >
                        <p>
                            Once the requirements have been confirmed, Lens
                            evaluates the cars on the listings page and displays
                            the results.
                        </p>

                        <Subsection title="4.1. See how each car fits">
                            <Screenshot src={resultChips} alt="Finn Lens results and fit indicators" />
                            <p>
                                Lens attaches a clickable result chip to each car it
                                evaluates. The chips distinguish the top pick from
                                cars that may still be suitable and cars that have
                                been ruled out.
                            </p>

                            <p>
                                The chips aren't just labels. Clicking one opens a
                                drawer with a breakdown of that car's evaluation,
                                whether it won or not.
                            </p>

                            <p>
                                This means you can inspect the runner-up, understand
                                why a car lost against the winner, or find out why
                                another car was ruled out entirely.
                            </p>

                            <p>
                                The goal isn't simply to identify one winner and
                                leave you to guess what happened to the other
                                options. Every evaluated car has a reason for its
                                result, and Lens gives you a way to explore it.
                            </p>
                        </Subsection>

                        <Subsection title="4.2. Inspect the reasoning behind a result">
                            <Screenshot src={resultDrawer} alt="Detailed breakdown of a car's evaluation" />
                            <p>
                                Clicking a car's result chip opens its evaluation
                                drawer, where you can inspect the reasoning behind
                                its outcome.
                            </p>

                            <p>
                                For the top pick, the breakdown helps explain why it
                                came out ahead. For another suitable car, it can show
                                where it fell short compared with the winner. For a
                                car that was ruled out, it explains why it didn't
                                qualify.
                            </p>

                            <p>
                                This lets you compare the reasoning across different
                                cars instead of treating the top pick as an answer
                                you have to accept on faith.
                            </p>

                            <p>
                                A top pick is ultimately the result of applying
                                Lens's predefined scoring model to your stated needs
                                and priorities. It isn't a guarantee that the car is
                                the right choice for everyone.
                            </p>
                        </Subsection>
                    </SectionCard>
                </section>

                {/* Beta note */}
                <section className="rounded-2xl border border-[#e8e5df] bg-white p-5 sm:p-6">
                    <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fff4d8]">
                            <BookOpen
                                aria-hidden="true"
                                className="h-4 w-4 text-[#855b00]"
                            />
                        </div>

                        <div className="min-w-0 flex-1">
                            <h2 className="text-base font-black text-[#17243b]">
                                A note on the current beta
                            </h2>

                            <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-[#17243b]/80">
                                <p>
                                    Finn Lens currently uses a predefined scoring
                                    system to evaluate cars against the user's
                                    requirements and priorities. The conversational
                                    interface helps gather and interpret those
                                    requirements, but natural-language AI integration
                                    is a potential future enhancement, not part of
                                    the current beta.
                                </p>

                                <p>
                                    The quality of the results depends on the
                                    vehicle data available, the assumptions built
                                    into the scoring model, and the accuracy of the
                                    user's answers. The results should therefore be
                                    treated as decision support, not definitive
                                    advice.
                                </p>

                                <p>
                                    Finn Lens is an independent project and is not
                                    an official FINN product.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
            {open != null ? <Lightbox index={open} onIndex={setOpen} onClose={() => setOpen(null)} /> : null}
        </OpenScreenshot.Provider>
    );
}

function SectionCard({
    number,
    title,
    icon,
    children,
}: {
    number: string;
    title: string;
    icon: ReactNode;
    children: ReactNode;
}) {
    return (
        <article className="overflow-hidden rounded-2xl border border-[#e8e5df] bg-white">
            <header className="flex items-start gap-3 border-b border-[#e8e5df] bg-[#fbfcfe] px-5 py-4 sm:px-6">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#003087] text-sm font-black text-white">
                    {number}
                </span>

                <div className="min-w-0 flex-1">
                    <h2 className="text-base font-black text-[#17243b] sm:text-lg">
                        {title}
                    </h2>
                </div>

                <span className="mt-1 shrink-0 text-[#0072ea] [&>svg]:h-5 [&>svg]:w-5">
                    {icon}
                </span>
            </header>

            <div className="space-y-4 px-5 py-5 text-[13.5px] leading-relaxed text-[#17243b]/85 sm:px-6 sm:py-6">
                {children}
            </div>
        </article>
    );
}

function Subsection({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    return (
        <section className="mt-6 border-l-2 border-[#d7e8ff] pl-4 sm:pl-5">
            <h3 className="mb-3 text-sm font-black leading-snug text-[#17243b] sm:text-[15px]">
                {title}
            </h3>

            <div className="space-y-3">{children}</div>
        </section>
    );
}

/** A screenshot on the page: click it to open it full size, with the others a step away. */
function Screenshot({ src, alt }: { src: string; alt: string }) {
    const open = useContext(OpenScreenshot);

    return (
        <figure className="my-6">
            <button
                type="button"
                onClick={() => open(src)}
                aria-label={`Enlarge: ${alt}`}
                className="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg border border-slate-200 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0072ea]"
            >
                <img src={src} alt={alt} className="block h-auto w-full" loading="lazy" />
                <span className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-[#17243b]/80 px-3 py-1.5 text-[12px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Maximize2 aria-hidden="true" className="h-3.5 w-3.5" />
                    Enlarge
                </span>
            </button>
            <figcaption className="mt-2 flex items-center justify-between gap-3 text-[13px] text-[#17243b]/75">
                <span>{alt}</span>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px]">
                    <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
                    Click to enlarge
                </span>
            </figcaption>
        </figure>
    );
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/**
 * A screenshot full size, over the page.
 *
 * Zoom with the buttons, the wheel, a double-click or a pinch; drag to move
 * around once zoomed in. The arrows, the arrow keys or a swipe go to the
 * screenshot before or after, and Escape closes it.
 */
function Lightbox({ index, onIndex, onClose }: { index: number; onIndex: (index: number) => void; onClose: () => void }) {
    const shot = GALLERY[index]!;
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const stage = useRef<HTMLDivElement>(null);
    const closeButton = useRef<HTMLButtonElement>(null);
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const gesture = useRef<{ startX: number; startY: number; offset: { x: number; y: number }; zoom: number; distance: number } | null>(null);

    const hasPrevious = index > 0;
    const hasNext = index < GALLERY.length - 1;
    const go = (step: number) => {
        const next = index + step;
        if (next >= 0 && next < GALLERY.length) onIndex(next);
    };

    /* A new screenshot starts whole. */
    useEffect(() => {
        setZoom(1);
        setOffset({ x: 0, y: 0 });
    }, [index]);

    /* The page behind stays put, the keys work, and focus comes back where it was. */
    useEffect(() => {
        const before = document.activeElement as HTMLElement | null;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        closeButton.current?.focus();

        return () => {
            document.body.style.overflow = overflow;
            before?.focus();
        };
    }, []);

    /** Zoom to `next`, keeping the point under (x, y) — relative to the stage's centre — where it is. */
    const zoomAt = (next: number, x = 0, y = 0) => {
        const target = clampZoom(next);
        setOffset((current) => (target === 1 ? { x: 0, y: 0 } : { x: x - ((x - current.x) * target) / zoom, y: y - ((y - current.y) * target) / zoom }));
        setZoom(target);
    };

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
            else if (event.key === "ArrowLeft") go(-1);
            else if (event.key === "ArrowRight") go(1);
            else if (event.key === "+" || event.key === "=") zoomAt(zoom * 1.5);
            else if (event.key === "-") zoomAt(zoom / 1.5);
            else if (event.key === "0") zoomAt(1);
            else return;
            event.preventDefault();
        };

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    const fromCentre = (clientX: number, clientY: number) => {
        const box = stage.current!.getBoundingClientRect();
        return { x: clientX - box.left - box.width / 2, y: clientY - box.top - box.height / 2 };
    };

    const spread = () => {
        const [a, b] = [...pointers.current.values()];
        return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };

    return (
        <div role="dialog" aria-modal="true" aria-label={shot.alt} className="fixed inset-0 z-50 flex flex-col bg-[#0b1220] text-white">
            <div className="relative z-10 flex items-center gap-3 bg-[#0b1220] px-4 py-3 sm:px-6">
                <p className="min-w-0 flex-1 truncate text-[14px] font-bold">
                    {shot.alt}
                    <span className="ml-2 font-normal text-white/70">
                        {index + 1} / {GALLERY.length}
                    </span>
                </p>
                <LightboxButton label="Zoom out" onClick={() => zoomAt(zoom / 1.5)} disabled={zoom <= MIN_ZOOM}>
                    <ZoomOut className="h-5 w-5" />
                </LightboxButton>
                <span className="w-12 text-center font-mono text-[13px] tabular-nums text-white/80">{Math.round(zoom * 100)}%</span>
                <LightboxButton label="Zoom in" onClick={() => zoomAt(zoom * 1.5)} disabled={zoom >= MAX_ZOOM}>
                    <ZoomIn className="h-5 w-5" />
                </LightboxButton>
                <LightboxButton label="Back to full view" onClick={() => zoomAt(1)} disabled={zoom === 1}>
                    <RotateCcw className="h-5 w-5" />
                </LightboxButton>
                <button
                    ref={closeButton}
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="ml-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>

            <div
                ref={stage}
                className={`relative min-h-0 flex-1 touch-none overflow-hidden select-none ${zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
                onWheel={(event) => {
                    const point = fromCentre(event.clientX, event.clientY);
                    zoomAt(zoom * (event.deltaY < 0 ? 1.2 : 1 / 1.2), point.x, point.y);
                }}
                onDoubleClick={(event) => {
                    const point = fromCentre(event.clientX, event.clientY);
                    zoomAt(zoom > 1 ? 1 : 2.5, point.x, point.y);
                }}
                onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                    gesture.current = { startX: event.clientX, startY: event.clientY, offset, zoom, distance: spread() };
                }}
                onPointerMove={(event) => {
                    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
                    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                    const start = gesture.current;

                    if (pointers.current.size === 2 && start.distance > 0) {
                        setZoom(clampZoom((start.zoom * spread()) / start.distance));
                    } else if (zoom > 1) {
                        setOffset({ x: start.offset.x + event.clientX - start.startX, y: start.offset.y + event.clientY - start.startY });
                    }
                }}
                onPointerUp={(event) => {
                    const start = gesture.current;
                    pointers.current.delete(event.pointerId);
                    /* Not zoomed in, a sideways swipe is a step to the next or previous screenshot. */
                    if (start && zoom === 1 && pointers.current.size === 0) {
                        const dx = event.clientX - start.startX;
                        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(event.clientY - start.startY)) go(dx < 0 ? 1 : -1);
                    }
                    gesture.current = pointers.current.size ? { ...start!, startX: event.clientX, startY: event.clientY, offset, zoom, distance: spread() } : null;
                }}
                onPointerCancel={(event) => {
                    pointers.current.delete(event.pointerId);
                    gesture.current = null;
                }}
            >
                <img
                    src={shot.src}
                    alt={shot.alt}
                    draggable={false}
                    className="absolute inset-0 m-auto max-h-full max-w-full object-contain p-2 sm:p-6"
                    style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transition: gesture.current ? "none" : "transform 120ms ease-out" }}
                />

                <LightboxArrow side="left" label="Previous screenshot" onClick={() => go(-1)} disabled={!hasPrevious} />
                <LightboxArrow side="right" label="Next screenshot" onClick={() => go(1)} disabled={!hasNext} />
            </div>

            <p className="relative z-10 bg-[#0b1220] px-4 py-2.5 text-center text-[12.5px] text-white/75 sm:px-6">
                Scroll or double-click to zoom · drag to move around · ← → for the others · Esc to close
            </p>
        </div>
    );
}

function LightboxButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            title={label}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-35 disabled:hover:bg-white/10"
        >
            {children}
        </button>
    );
}

function LightboxArrow({ side, label, onClick, disabled }: { side: "left" | "right"; label: string; onClick: () => void; disabled: boolean }) {
    if (disabled) return null;

    return (
        <button
            type="button"
            onClick={onClick}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label={label}
            className={`absolute top-1/2 ${side === "left" ? "left-3 sm:left-5" : "right-3 sm:right-5"} inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-[#17243b]/85 text-white shadow-lg ring-1 ring-white/30 hover:bg-[#003087] focus-visible:outline-2 focus-visible:outline-white`}
        >
            {side === "left" ? <ChevronLeft className="h-7 w-7" /> : <ChevronRight className="h-7 w-7" />}
        </button>
    );
}
