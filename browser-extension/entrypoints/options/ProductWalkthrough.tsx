import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
    ChevronLeft,
    ChevronRight,
    Maximize2,
    MonitorPlay,
    RotateCcw,
    X,
    ZoomOut,
    CarFront,
    CheckCircle2,
    Download,
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

import { FIRST_STEPS, packageUrl } from "@/lib/release";

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
    { id: "demo-try-it", number: "05", label: "Try it yourself" },
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
const OpenScreenshot = createContext<(src: string) => void>(() => { });

/** `release` is the bare version, "0.9.1", which names the package to download. */
export function ProductWalkthrough({ release }: { release: string }) {
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

                <PageIntro icon={<MonitorPlay />} title="Product demo">
                    <p>
                        A reader's journey through Finn Lens, from saying what matters to them to seeing how the cars on the page compare. Click any
                        screenshot to see it full size.
                    </p>
                </PageIntro>

                {/* Table of contents, where there's no margin for it */}
                <div className="xl:hidden">
                    <OnThisPage groups={GROUPS} active={active} variant="inline" />
                </div>

                {/* 1. Meet Lens */}
                <section id="demo-meet-lens" className="scroll-mt-6">
                    <SectionCard number="1" title="Meet Lens" icon={<MessageSquareText />}>
                        <p>When you first install Finn Lens, it opens the listings page on finn.com and introduces itself in the chat.</p>

                        <Screenshot src={meetLens} alt="Finn Lens introduction" />

                        <p>
                            Lens explains what it does, how the conversation works, and what to expect from the results. Before judging the cars, it
                            wants to understand the person choosing them.
                        </p>
                    </SectionCard>
                </section>

                {/* 2. Tell Lens about your life */}
                <section id="demo-tell-lens" className="scroll-mt-6">
                    <SectionCard number="2" title="Tell Lens about your life" icon={<Users />}>
                        <p>
                            The conversation asks about your life in four sections. You answer by tapping, or with a value of your own where a question
                            allows one. Where an answer changes what Lens checks, a follow-up asks for the detail, and each answer says what Lens will
                            check for it and why. The <strong>i</strong> beside an answer says more.
                        </p>

                        <Subsection title="2.1. Who rides with you?">
                            <Screenshot src={whoRidesWithYou} alt="Passenger and child-seat questions" />
                            <p>
                                Lens starts with who regularly rides with you: kids, adults or teens, or a dog. Each changes what makes a car suitable.
                            </p>

                            <p>
                                Picking kids asks which child seat you need. In this example, Lens names rear doors as relevant and checks for ISOFIX
                                child-seat anchors.
                            </p>
                        </Subsection>

                        <Subsection title="2.2. Where and how do you drive?">
                            <Screenshot src={whereAndHowYouDrive} alt="Driving habits and parking questions" />
                            <p>
                                Next come your driving habits. City driving, traffic, long distances and where you park can all change which features
                                are useful to you.
                            </p>

                            <p>
                                Picking city driving asks where you usually park. For an open car park, Lens explains that reversing out of a space into
                                traffic is where rear cross-traffic alert helps.
                            </p>

                            <p>
                                The purpose isn't to recommend every driver-assistance feature there is. It's to find the ones that make sense for how you
                                drive.
                            </p>
                        </Subsection>

                        <Subsection title="2.3. What does the car need to cope with?">
                            <Screenshot src={whatTheCarCopesWith} alt="Weather and carrying requirements" />
                            <p>
                                Lens also asks about the conditions the car has to handle and what you carry. Cold winters with snow and ice call for
                                different equipment than hot summers, and the weekly shop for different equipment than bikes or bulky things.
                            </p>

                            <p>
                                Picking hot summers, for instance, has Lens check for ventilated seats, suggest 3-zone climate control, and make sure the
                                car has air conditioning.
                            </p>
                        </Subsection>

                        <Subsection title="2.4. Build on earlier answers">
                            <Screenshot src={recommendedComforts} alt="Comfort preferences and recommended features" />
                            <p>
                                As the conversation goes on, Lens recommends options based on what you've already told it. In this example, I said that
                                winters bring snow and ice and are cold, and that I spend a lot of time on the road. When I reached comfort, Lens
                                recommended a heated steering wheel, and its tooltip says why:
                            </p>

                            <blockquote className="rounded-r-xl border-l-[3px] border-[#0072ea] bg-[#edf5ff] px-4 py-3 text-[13.5px] leading-relaxed text-[#17243b]/85">
                                Recommended because you said winters bring snow and ice, winters are cold, and you spend a lot of time on the road.
                            </blockquote>

                            <p>
                                So the options aren't a static list: earlier answers decide what's suggested. A recommendation is only a suggestion, and
                                you decide whether it goes into your priorities.
                            </p>
                        </Subsection>

                        <Subsection title="2.5. Tell Lens what else matters to you">
                            <Screenshot src={whatElseMatters} alt="Additional preferences and natural-language summary" />
                            <p>
                                Beyond practical needs, Lens asks about comfort, how green the car should be, your budget and how long you need the car.
                                It then says your answers back in plain words:
                            </p>

                            <div className="space-y-3 rounded-xl border border-[#e8e5df] bg-[#faf9f6] p-4 text-[13.5px] leading-relaxed text-[#17243b]/85">
                                <p>
                                    <strong>You:</strong> Comfort matters to me — ventilated seats, lumbar support and premium sound. I care about the
                                    environment — clean for its fuel type.
                                </p>

                                <p>
                                    <strong>Lens:</strong> Got it — comfort matters to you and you care about the environment.
                                </p>
                            </div>

                            <p>
                                Budget and rental period are handled apart from these preferences. In this example, Lens takes €700 a month as a limit and
                                works out the rental term that covers the requested period. A preference helps Lens compare suitable cars; a limit can
                                rule a car out.
                            </p>
                        </Subsection>

                        <Subsection title="2.6. Understand the choices Lens recommends">
                            <Screenshot src={dealBreakersAndSealers} alt="Colour-coded choices and explanations" />
                            <p>
                                Lens marks different kinds of choices with colours, and each option's tooltip says what it means and why it may be
                                relevant. If you've said you regularly meet snow and ice, for example, Lens may recommend all-wheel drive (AWD).
                            </p>
                            <Screenshot src={allWheelDriveTip} alt="All-wheel-drive explanation" />
                            <p>
                                Its tooltip gives the trade-off: AWD helps traction when pulling away on snow, but it doesn't help braking on snow or
                                replace winter tyres. The source link lets you check the claim rather than take Lens's word for it.
                            </p>
                        </Subsection>
                    </SectionCard>
                </section>

                {/* 3. Review and refine */}
                <section id="demo-review-understanding" className="scroll-mt-6">
                    <SectionCard number="3" title="Review and refine Lens's understanding" icon={<CheckCircle2 />}>
                        <p>Before evaluating the cars, Lens summarizes what it has understood.</p>

                        <Subsection title="3.1. See how your answers are interpreted">
                            <Screenshot src={summaryOfAnswers} alt="Summary of answers and priorities" />
                            <p>
                                The summary brings together your answers, what Lens will check for each, and how much each counts:{" "}
                                <strong>Top priority</strong> (4), <strong>Important</strong> (2) or <strong>Nice to have</strong> (1), each counting
                                twice the next. A car can still win without meeting a top priority, but it has to make up for it elsewhere.
                            </p>

                            <p>
                                A dashed outline on how much something counts marks Lens's own guess from your answers, not a level you picked. It shows
                                where Lens is interpreting your needs rather than recording your choices.
                            </p>
                        </Subsection>

                        <Subsection title="3.2. Confirm or correct the summary">
                            <Screenshot src={confirmTheSummary} alt="Prompt to confirm the summary" />
                            <p>
                                Lens then asks whether its understanding looks right. If it doesn't, <strong>This doesn't look right</strong> opens the
                                adjustment panel.
                            </p>
                            <Screenshot src={adjustPanel} alt="Editable summary and adjustment panel" />
                            <p>
                                The panel shows the same summary in a form you can edit: take out or add what Lens checks, change how much something
                                counts, or answer a question again, until it says what you meant. Lens evaluates the cars only after you've had that
                                chance to correct it.
                            </p>
                        </Subsection>

                        <Subsection title="3.3. Decide whether to save your settings">
                            <Screenshot src={saveSettings} alt="Save settings prompt" />
                            <p>
                                Once you confirm, Lens asks whether to keep your answers as your settings or use them for this chat only. Saved settings
                                are where future chats start, so you don't repeat the whole conversation. You can still change them in a chat, and review
                                or forget them in Settings.
                            </p>
                        </Subsection>
                    </SectionCard>
                </section>

                {/* 4. Explore your results */}
                <section id="demo-explore-results" className="scroll-mt-6">
                    <SectionCard number="4" title="Explore your results" icon={<CarFront />}>
                        <p>Lens then evaluates the cars on the listings page.</p>

                        <Subsection title="4.1. See how each car fits">
                            <Screenshot src={resultChips} alt="Finn Lens results and fit indicators" />
                            <p>
                                Every car Lens evaluates gets a chip on its card, and the top pick, cars that may still suit you and cars that were ruled
                                out each look different. A chip isn't just a label: clicking it opens that car's drawer, whether it won or not.
                            </p>
                        </Subsection>

                        <Subsection title="4.2. Inspect the reasoning behind a result">
                            <Screenshot src={resultDrawer} alt="Detailed breakdown of a car's evaluation" />
                            <p>
                                The drawer explains the car's outcome: for the top pick, why it came out ahead; for another suitable car, where it fell
                                short of the winner; for a ruled-out car, why it didn't qualify. You can compare the reasoning across cars instead of
                                taking the pick on faith.
                            </p>

                            <p>
                                A top pick is what Lens's predefined scoring model makes of your stated needs and priorities; no AI model is involved. It
                                depends on the vehicle data, the model's assumptions and your answers, so treat it as decision support, not a guarantee
                                that the car is right for you.
                            </p>
                        </Subsection>
                    </SectionCard>
                </section>

                {/* 5. Try it yourself */}
                <section id="demo-try-it" className="scroll-mt-6">
                    <SectionCard number="5" title="Try it yourself" icon={<Download />}>
                        <p>
                            Finn Lens isn't on the Chrome Web Store. This beta is a package you load into Chrome yourself, on a computer; it takes about
                            two minutes.
                        </p>

                        <a
                            href={packageUrl(release)}
                            className="inline-flex items-center gap-2 rounded-full bg-[#003087] px-5 py-2.5 text-[13.5px] font-black text-white transition-colors hover:bg-[#0072ea] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0072ea]"
                        >
                            <Download aria-hidden="true" className="h-4 w-4" />
                            Download the {release} beta (.zip)
                        </a>

                        <ol className="list-decimal space-y-2 pl-5 marker:font-black marker:text-[#003087]">
                            <li>Unzip it. You get a folder holding <code className="font-mono text-[12.5px]">manifest.json</code>.</li>
                            <li>
                                Open <code className="font-mono text-[12.5px]">chrome://extensions</code> and switch on <strong>Developer mode</strong> (top
                                right).
                            </li>
                            <li>
                                Click <strong>Load unpacked</strong> and choose that folder. Keep the folder where it is: Chrome loads Lens from it each
                                time.
                            </li>
                            <li>
                                Lens opens finn.com in a new tab, and its chat opens by itself. If it doesn't, click the <strong>Lens</strong> bubble in the
                                bottom-right corner.
                            </li>
                        </ol>

                        <p>
                            It runs only on www.finn.com, and tabs that were already open need a reload. Chrome may warn about extensions in developer
                            mode; that's expected for a build that isn't from the store. Once it's running, the beta note suggests{" "}
                            <a href={FIRST_STEPS} className="font-bold text-[#0072ea] underline">
                                what to try in your first five minutes
                            </a>
                            .
                        </p>
                    </SectionCard>
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
            <header className="flex items-center gap-3 border-b border-[#e8e5df] bg-[#fbfcfe] px-5 py-4 sm:px-6">
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
            <figcaption className="mt-2 text-[13px] text-[#17243b]/75">{alt}</figcaption>
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
