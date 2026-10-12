import type { ReactNode } from "react";
import {
    BookOpen,
    CarFront,
    CheckCircle2,
    MessageSquareText,
    Users,
    ZoomIn,
} from "lucide-react";
import image0 from "@/assets/images/walkthrough/image.png";
import image1 from "@/assets/images/walkthrough/image-1.png";
import image2 from "@/assets/images/walkthrough/image-2.png";
import image3 from "@/assets/images/walkthrough/image-3.png";
import image4 from "@/assets/images/walkthrough/image-4.png";
import image5 from "@/assets/images/walkthrough/image-5.png";
import image6 from "@/assets/images/walkthrough/image-6.png";
import image7 from "@/assets/images/walkthrough/image-7.png";
import image8 from "@/assets/images/walkthrough/image-8.png";
import image9 from "@/assets/images/walkthrough/image-9.png";
import image10 from "@/assets/images/walkthrough/image-10.png";
import image11 from "@/assets/images/walkthrough/image-11.png";
import image14 from "@/assets/images/walkthrough/image-14.png";
import image15 from "@/assets/images/walkthrough/image-15.png";

import { OnThisPage, useActiveSection } from "./OnThisPage";

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

export function ProductWalkthrough() {
    const active = useActiveSection(SECTION_IDS);

    return (
        <div className="relative space-y-4">
            {/* The contents, pinned in the margin where the window is wide enough to have one. */}
            <aside className="absolute top-0 right-full mr-10 hidden h-full w-52 xl:block">
                <div className="sticky top-8">
                    <OnThisPage groups={GROUPS} active={active} variant="rail" />
                </div>
            </aside>

            {/* Introduction */}
            <header className="rounded-2xl border border-[#e8e5df] bg-white p-5 sm:p-6">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eaf3ff]">
                        <BookOpen
                            aria-hidden="true"
                            className="h-5 w-5 text-[#0072ea]"
                        />
                    </div>

                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-[#0072ea]">
                            FINN Lens · Product demo
                        </p>
                        <h2 className="mt-1 text-xl font-black text-[#17243b] sm:text-2xl">
                            Product walkthrough
                        </h2>
                        <p className="mt-2 text-[13.5px] leading-relaxed text-[#17243b]/75">
                            This walkthrough follows the user's journey through FINN
                            Lens, from figuring out what matters to them to
                            understanding how the available cars compare.
                        </p>
                    </div>
                </div>
            </header>

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
                        When you first install FINN Lens, it opens the listings
                        page on finn.com and introduces itself through the chat.
                    </p>

                    <Screenshot
                        alt="FINN Lens introduction"
                        image={<img src={image0} alt="FINN Lens introduction" />}
                    />

                    <p>
                        Lens explains what it does, how the conversation works,
                        and what to expect from the results. You can answer by
                        selecting options or, where supported, input custom values.
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
                        <Screenshot
                            image={<img src={image1} alt="Passenger and child-seat questions" />}
                            alt="Passenger and child-seat questions"
                        />
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
                        <Screenshot
                            image={<img src={image2} alt="Driving habits and parking questions" />}
                            alt="Driving habits and parking questions"
                        />
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
                        <Screenshot
                            image={<img src={image3} alt="Weather and carrying requirements" />}
                            alt="Weather and carrying requirements"
                        />
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
                        <Screenshot
                            image={<img src={image4} alt="Comfort preferences and recommended features" />}
                            alt="Comfort preferences and recommended features"
                        />
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
                        <Screenshot
                            image={<img src={image5} alt="Additional preferences and natural-language summary" />}
                            alt="Additional preferences and natural-language summary"
                        />
                        <p>
                            Beyond practical requirements, Lens asks about other
                            preferences, including comfort and environmental
                            considerations.
                        </p>

                        <p>
                            You can choose specific comfort features and indicate
                            how much environmental considerations matter to you.
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
                        <Screenshot
                            image={<img src={image6} alt="Colour-coded choices and explanations" />}
                            alt="Colour-coded choices and explanations"
                        />
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
                        <Screenshot
                            image={<img src={image7} alt="All-wheel-drive explanation" />}
                            alt="All-wheel-drive explanation"
                        />
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
                        <Screenshot image={<img src={image9} alt="Summary of answers and priorities" />} alt="Summary of answers and priorities" />
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
                            A dashed outline on a score indicates an inference
                            made by Lens from your answers, rather than something
                            you explicitly selected.
                        </p>

                        <p>
                            This distinction helps you identify where Lens is
                            interpreting your needs instead of simply recording
                            your choices.
                        </p>
                    </Subsection>

                    <Subsection title="3.2. Confirm or correct the summary">
                        <Screenshot
                            image={<img src={image8} alt="Prompt to confirm the summary" />}
                            alt="Prompt to confirm the summary"
                        />
                        <p>
                            Once the summary is ready, Lens asks whether its
                            understanding looks right or needs adjustment.
                        </p>

                        <p>
                            If something is wrong, you can select the option
                            indicating that the summary doesn't look right.
                        </p>
                        <Screenshot
                            image={<img src={image10} alt="Editable summary and adjustment panel" />}
                            alt="Editable summary and adjustment panel"
                        />
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
                        <Screenshot
                            image={<img src={image11} alt="Save settings prompt" />}
                            alt="Save settings prompt"
                        />
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
                        <Screenshot
                            image={<img src={image14} alt="FINN Lens results and fit indicators" />}
                            alt="FINN Lens results and fit indicators"
                        />
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
                        <Screenshot
                            image={<img src={image15} alt="Detailed breakdown of a car's evaluation" />}
                            alt="Detailed breakdown of a car's evaluation"
                        />
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
                                FINN Lens currently uses a predefined scoring
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
                                FINN Lens is an independent project and is not
                                an official FINN product.
                            </p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
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

function Screenshot({
    image,
    alt,
}: {
    image: ReactNode;
    alt: string;
}) {
    const [zoom, setZoom] = useState({ x: 50, y: 50, visible: false });

    return (
        <figure className="my-6">
            <div
                className="relative cursor-crosshair overflow-hidden border border-slate-200"
                onMouseEnter={() =>
                    setZoom((prev) => ({ ...prev, visible: true }))
                }
                onMouseLeave={() =>
                    setZoom((prev) => ({ ...prev, visible: false }))
                }
                onMouseMove={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();

                    setZoom({
                        x: ((event.clientX - rect.left) / rect.width) * 100,
                        y: ((event.clientY - rect.top) / rect.height) * 100,
                        visible: true,
                    });
                }}
                onClick={() =>
                    setZoom((prev) => ({ ...prev, visible: !prev.visible }))
                }
            >
                <div className="[&>img]:block [&>img]:h-auto [&>img]:w-full">
                    {image}
                </div>

                {zoom.visible && (
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 hidden bg-no-repeat md:block"
                        style={{
                            backgroundImage: `url(${(image as any)?.props?.src ?? ""})`,
                            backgroundSize: "225%",
                            backgroundPosition: `${zoom.x}% ${zoom.y}%`,
                        }}
                    />
                )}
            </div>
            <div className="flex items-center justify-between">
                <figcaption className="mt-2 text-sm text-slate-500">
                    {alt}
                </figcaption>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                    <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Hover Image to zoom in</span>
                </div>
            </div>
        </figure>
    );
}