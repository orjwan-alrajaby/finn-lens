import type { ReactNode } from "react";
import {
    BookOpen,
    ChevronDown,
    Compass,
    FlaskConical,
    Hammer,
    Lightbulb,
    ListChecks,
    MessageSquareText,
    Scale,
    Telescope,
} from "lucide-react";

import { BandChip, WinnerChip } from "@/components/lens-parts";

import { Card } from "./Card";
import { OnThisPage, useActiveSection, useScrollToHash } from "./OnThisPage";
import { PageIntro } from "./PageIntro";

const SECTION_GROUPS = [
    {
        label: "The basics",
        items: [
            { id: "guide-what", label: "What is Finn Lens?", number: "01" },
            { id: "guide-why", label: "Why it exists", number: "02" },
        ],
    },
    {
        label: "Using Lens",
        items: [
            { id: "guide-how", label: "How it works", number: "03" },
            { id: "guide-results", label: "Understanding results", number: "04" },
        ],
    },
    {
        label: "About this beta",
        items: [
            { id: "guide-beta", label: "Status and limitations", number: "05" },
            { id: "guide-next", label: "What might come next", number: "06" },
            { id: "guide-built", label: "How it was built", number: "07" },
            { id: "guide-feedback", label: "Feedback and bug reports", number: "08" },
        ],
    },
] as const;

const SECTION_IDS = SECTION_GROUPS.flatMap((group) => group.items.map((item) => item.id));

/** `version` is passed in, not read from the extension, so the guide also renders as a plain web page (`site/`). */
export function Guide({ version }: { version: string }) {
    const active = useActiveSection(SECTION_IDS);
    useScrollToHash();

    return (
        <div className="relative space-y-4 pb-6">
            {/* The contents, pinned in the margin where the window is wide enough to have one. */}
            <aside className="absolute top-0 right-full mr-10 hidden h-full w-52 xl:block">
                <div className="sticky top-8">
                    <OnThisPage groups={SECTION_GROUPS} active={active} variant="rail" />
                </div>
            </aside>

            <PageIntro
                icon={<BookOpen />}
                title="Beta guide"
                badge={<span className="rounded-full bg-finn-warning-lift px-2.5 py-1 text-[11px] font-bold text-finn-warning-ink">{version}</span>}
            >
                <p>How Lens works, how to read its recommendations, and what to keep in mind while testing this version.</p>
                <div className="rounded-xl bg-finn-pale-blue/70 p-3.5">
                    <p className="text-[13px] font-bold text-finn-black">An early working prototype for evaluation</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-finn-black/80">
                        Lens starts with your circumstances, compares the cars available on FINN against your needs, and explains the trade-offs. Its
                        recommendations depend on your answers, the available vehicle data, and documented assumptions. They are not a guarantee that a
                        car is right for you or that its actual running costs will match the estimate.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <QuickTag>No AI in this beta</QuickTag>
                    <QuickTag>Personalized comparisons</QuickTag>
                    <QuickTag>Explainable results</QuickTag>
                </div>
            </PageIntro>

            {/* Table of contents, where there's no margin for it */}
            <div className="xl:hidden">
                <OnThisPage groups={SECTION_GROUPS} active={active} variant="inline" />
            </div>

            {/* 1. What is Finn Lens? */}
            <Card
                id="guide-what"
                icon={<BookOpen className="h-5 w-5" />}
                title="What is Finn Lens?"
            >
                <Prose>
                    <p>
                        Finn Lens is an unofficial browser extension for{" "}
                        <strong>finn.com</strong>, where cars are offered on monthly
                        subscriptions. It helps you work out which available car best
                        fits <em>your</em> circumstances.
                    </p>
                    <p>
                        Tell Lens who rides with you, how and where you drive, what
                        the car needs to handle, what you can spend, and how long
                        you need it. Lens evaluates the cars on the page against
                        your answers, ranks eligible options, and explains the
                        reasoning and trade-offs.
                    </p>
                    <p>
                        Lens is <strong>not made by or affiliated with FINN</strong>.
                    </p>
                </Prose>

                <KeyPoint>
                    Lens is designed to answer "Which car fits my situation?" rather
                    than simply "Which cars have these specifications?"
                </KeyPoint>
            </Card>

            {/* 2. Why it exists */}
            <Card
                id="guide-why"
                icon={<Compass className="h-5 w-5" />}
                title="Why it exists"
            >
                <Prose>
                    <p>
                        Filters help you narrow down cars by fuel, body type, price,
                        or equipment. They don't necessarily help you weigh those
                        things against one another.
                    </p>
                    <p>
                        Perhaps one car has the parking camera you'll use every day,
                        another has a lower subscription price but higher estimated
                        running costs, and a third doesn't fit your rental dates.
                        A specification list leaves you to make those trade-offs
                        yourself.
                    </p>
                    <p>
                        Lens starts with your circumstances, evaluates the relevant
                        criteria using available data, and explains why a car ranks
                        where it does, including what you might give up by choosing it.
                    </p>
                </Prose>
            </Card>

            {/* 3. How it works */}
            <Card
                id="guide-how"
                icon={<ListChecks className="h-5 w-5" />}
                title="How it works"
            >
                <div className="space-y-6">
                    <Step n={1} title="Tell Lens about your situation">
                        <p>
                            Open the chat using the bubble on finn.com. Lens asks about
                            your passengers, driving habits, practical needs, budget,
                            rental dates and duration, mileage, fuel preferences, and
                            deal-breakers. Tap an answer or type one. The{" "}
                            <strong>i</strong> beside an answer explains what Lens
                            checks.
                        </p>
                    </Step>

                    <Step n={2} title="Review what Lens understood">
                        <p>
                            Before evaluating cars, Lens shows how it interpreted your
                            answers, which criteria it will check, and how much each
                            preference counts. If something looks wrong, use{" "}
                            <strong>This doesn't look right</strong> to adjust the
                            criteria, change priorities, or answer a question again.
                            You can save your settings for future chats.
                        </p>
                    </Step>

                    <Step n={3} title="Requirements filter; preferences are weighed">
                        <p>
                            Some answers determine whether a car is eligible to win.
                            Others affect how well an eligible car scores. The
                            distinction matters: a preference can influence the
                            ranking without excluding a car.
                        </p>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <Panel title="Requirements">
                                <p>
                                    A car that fails a requirement is excluded from the
                                    regular ranking.
                                </p>
                                <ul className="mt-2 list-disc space-y-1.5 pl-5">
                                    <li>
                                        <strong>Must have, Must be, or Mustn't be:</strong>{" "}
                                        explicit deal-breakers, such as requiring an
                                        automatic gearbox.
                                    </li>
                                    <li>Fuels you didn't select.</li>
                                    <li>
                                        Your rental dates. “A month either way” loosens
                                        them; “Doesn't matter” lifts them.
                                    </li>
                                    <li>
                                        Your monthly budget, when you've asked Lens to
                                        treat it as a hard limit.
                                    </li>
                                </ul>
                                <p className="mt-2">
                                    If FINN's data can't confirm that a car meets a
                                    requirement, Lens may rule it out. If nothing
                                    qualifies, Lens can ask which constraint you could
                                    relax or offer the nearest available dates.
                                </p>
                            </Panel>

                            <Panel title="Preferences">
                                <p>
                                    Preferences contribute to a car's fit. For example,
                                    asking about snow and ice can lead Lens to check
                                    for heated seats and a heated steering wheel.
                                </p>
                                <ul className="mt-2 list-disc space-y-1.5 pl-5">
                                    <li>
                                        <strong>Top priority:</strong> twice the weight
                                        of Important.
                                    </li>
                                    <li>
                                        <strong>Important:</strong> standard weighting.
                                    </li>
                                    <li>
                                        <strong>Nice to have:</strong> half the weight
                                        of Important.
                                    </li>
                                </ul>
                                <p className="mt-2">
                                    <strong>Seals it</strong> gives a preference Top
                                    priority weighting. It does not make that feature
                                    mandatory. Use a must-have requirement when
                                    something is non-negotiable.
                                </p>
                            </Panel>
                        </div>
                    </Step>

                    <Step n={4} title="Cars are scored against your answers">
                        <p>
                            Lens scores how well each car matches your criteria and
                            weights those criteria by importance. It doesn't add its
                            own preferences, and a car's score doesn't depend on which
                            other cars happen to be on the page.
                        </p>

                        <MoreDetails title="How individual criteria affect the score">
                            <ul className="list-disc space-y-2 pl-5">
                                <li>
                                    Measurements, CO₂, and consumption can contribute
                                    on a scale rather than as a simple yes-or-no check.
                                    Consumption is compared against a reference for
                                    the car's fuel type.
                                </li>
                                <li>
                                    Equipment that nearly every FINN car has, such as
                                    emergency braking, earns nothing for being there. A
                                    car FINN says lacks it loses a little, wherever
                                    something else you asked for is scored in the same
                                    group. The summary only lists the ones that do.
                                </li>
                                <li>
                                    <strong>Overlaps count once.</strong> When two of
                                    your answers point to the same item, it's counted a
                                    single time, at the higher of the two levels.
                                </li>
                                <li>
                                    <strong>Unknown isn't no.</strong> When the data
                                    doesn't establish whether a car has a feature, Lens
                                    can leave that criterion unscored and identify
                                    relevant uncertainty in the result.
                                </li>
                            </ul>
                        </MoreDetails>
                    </Step>

                    <Step n={5} title="Cost determines eligibility, not preference">
                        <p>
                            A cheaper car doesn't score higher simply because it costs
                            less. With a monthly limit, estimated cost decides which
                            cars may win: one over it can't be the pick while a car
                            within it exists. A hard limit goes further and rules cars
                            over it out.
                        </p>

                        <p className="mt-2">
                            The estimated monthly cost can include:
                        </p>

                        <ul className="mt-2 list-disc space-y-1.5 pl-5">
                            <li>
                                <strong>Subscription:</strong> FINN's monthly price,
                                including VAT, using the shortest available term that
                                covers your rental dates.
                            </li>
                            <li>
                                <strong>Fuel or charging:</strong> estimated from the
                                consumption FINN lists for the car and assumed prices:
                                petrol €1.75/litre, diesel €1.70/litre, and electricity
                                €0.32/kWh.
                            </li>
                            <li>
                                <strong>Mileage package:</strong> the price of the
                                smallest FINN mileage package that covers your monthly
                                distance, if it's more than the price includes.
                            </li>
                        </ul>

                        <div className="mt-3 rounded-xl border border-finn-cotton bg-white p-3.5">
                            <div className="flex items-start gap-2">
                                <Lightbulb
                                    aria-hidden="true"
                                    className="mt-0.5 h-4 w-4 shrink-0 text-finn-accent-blue"
                                />
                                <div className="min-w-0">
                                    <p className="text-[13px] font-bold text-finn-black">
                                        Where the mileage price comes from
                                    </p>
                                    <p className="mt-1 text-[13px] leading-relaxed text-finn-black/80">
                                        FINN's data lists each car's mileage packages and
                                        what each adds to the monthly price, from 500 km a
                                        month, at no extra cost, up to 5,000 km. Lens takes
                                        them from there, and adds FINN's per-kilometre price
                                        only for distance beyond the largest package. For a
                                        car whose data doesn't list its packages, Lens
                                        assumes 500 km a month is included and says so.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <p className="mt-3">
                            If you haven't specified your mileage, Lens uses an
                            assumed distance of 1,000 km per month for its estimate.
                            Treat the total as an estimate, not a guaranteed quote.
                        </p>
                    </Step>

                    <Step n={6} title="Lens explains the result">
                        <p>
                            See which car came out ahead, why it won, where it falls
                            short, and how it compares with alternatives. You can
                            inspect an individual car's explanation and save the
                            results as a PDF.
                        </p>
                    </Step>

                    <MoreDetails title="Where the vehicle facts come from">
                        <Prose>
                            <p>
                                Lens uses the data available from FINN, including
                                equipment, measurements, consumption and CO₂ figures,
                                prices, subscription terms, and delivery windows.
                            </p>
                            <p>
                                Where a particular figure isn't available, Lens may
                                use an external reference. For example, plug-in hybrid
                                electricity consumption can come from EU registration
                                data, and CO₂ classes use Germany's classification rules.
                            </p>
                        </Prose>

                        <div className="mt-3 space-y-2">
                            <SourceRow
                                label="FINN data"
                                description="Information provided by the listing or vehicle data."
                            />
                            <SourceRow
                                label="External reference"
                                description="Information from another source, used where FINN data is missing."
                            />
                            <SourceRow
                                label="Lens estimate or assumption"
                                description="A calculated value or an input Lens uses because the exact value isn't available."
                            />
                        </div>
                    </MoreDetails>
                </div>
            </Card>

            {/* 4. Understanding results */}
            <Card
                id="guide-results"
                icon={<Scale className="h-5 w-5" />}
                title="Understanding the results"
            >
                <Prose>
                    <p>
                        Each evaluated car receives a verdict chip. The labels tell
                        you how well it matches your answers and whether it can win.
                    </p>
                </Prose>

                <dl className="mt-4 divide-y divide-finn-cotton overflow-hidden rounded-2xl border border-finn-cotton bg-white">
                    <Term chip={<WinnerChip />}>
                        <strong>Best for you.</strong> Lens's pick: the best fit among
                        the cars that meet your requirements.
                    </Term>

                    <Term chip={<WinnerChip label="Closest match" />}>
                        <strong>Closest match.</strong> Lens's pick when nothing on
                        the page fits your budget, your dates or a deal-breaker you
                        chose to keep. It's the nearest thing, not a match, and Lens
                        says which limit it misses.
                    </Term>

                    <Term
                        chip={
                            <span className="flex flex-wrap gap-1.5">
                                <BandChip band="strong" label="Strong match" />
                                <BandChip band="good" label="Good match" />
                                <BandChip band="partial" label="Partial match" />
                                <BandChip band="limited" label="Limited match" />
                            </span>
                        }
                    >
                        <strong>Match strength.</strong> How well the car fits your
                        preferences according to its score. Strong starts at 65/100,
                        Good at 45, Partial at 25, and Limited is below 25. The chip
                        also shows the car's place in the ranking, and “over budget”
                        when it costs more than your limit.
                    </Term>

                    <Term chip={<BandChip band="unknown" label="Not enough data" />}>
                        <strong>Not enough data.</strong> The available information
                        doesn't cover enough of your top two priorities to judge
                        the car confidently.
                    </Term>

                    <Term chip={<BandChip band="unknown" label="Ruled out" />}>
                        <strong>Ruled out.</strong> The car fails a requirement, such as
                        “not for your dates”. Its drawer says which one, and why.
                    </Term>
                </dl>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Panel title="What a result tells you">
                        <ul className="list-disc space-y-1.5 pl-5">
                            <li>
                                How cars compare against the things you told Lens,
                                using available vehicle information.
                            </li>
                            <li>
                                Why the pick won and what you'd give up by choosing it:
                                click its chip, or <strong>The whole case</strong> in the
                                chat. <strong>See why</strong> lists what it got right.
                            </li>
                            <li>
                                What information is missing and could affect the
                                comparison.
                            </li>
                            <li>
                                A PDF of any car's case, from its drawer, except a car
                                that was ruled out.
                            </li>
                        </ul>
                    </Panel>

                    <Panel title="What a result can't tell you">
                        <ul className="list-disc space-y-1.5 pl-5">
                            <li>
                                Whether a car is good in general. The score measures
                                fit to your answers, not overall quality.
                            </li>
                            <li>
                                Information FINN doesn't publish, such as reliability,
                                crash-test results, seat comfort, driving feel, or the
                                actual car's condition and history.
                            </li>
                            <li>
                                Exact running costs. The monthly total is an estimate
                                and excludes costs such as parking and tolls.
                            </li>
                        </ul>
                    </Panel>
                </div>

                <div className="mt-4 rounded-xl bg-finn-pale-blue/70 p-4">
                    <p className="text-[13px] font-bold text-finn-black">
                        Before you subscribe
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-finn-black/80">
                        Results depend on your answers, the scoring model, and the
                        data available at evaluation time. Verify the price, contract
                        term, delivery date, mileage package, and equipment on the
                        individual FINN listing. Use <strong>View on FINN</strong> in
                        the car's drawer to check the original details.
                    </p>
                </div>
            </Card>

            {/* 5. Beta status and limitations */}
            <Card
                id="guide-beta"
                icon={<FlaskConical className="h-5 w-5" />}
                title="Beta status and limitations"
            >
                <Prose>
                    <p>
                        This is beta version <strong>{version}</strong>. Lens is
                        still being evaluated, so it may contain bugs, missing
                        information, or produce a result that looks wrong.
                    </p>
                    <p>
                        The limitations below describe the current prototype. They
                        aren't necessarily limitations a future version would have
                        with access to better data.
                    </p>
                </Prose>

                <h3 className="mt-6 text-[14.5px] font-black text-finn-black">Known limitations</h3>

                <div className="mt-3 grid items-start gap-3 sm:grid-cols-2">
                    <LimitGroup title="Where it runs">
                        <Limit title="Tested only on Chrome.">Firefox and other Chromium browsers, such as Edge or Brave, haven't been tested.</Limit>
                        <Limit title="English only.">The beta supports only English, even though it runs on FINN's German site.</Limit>
                        <Limit title="Dependent on FINN's pages and data.">
                            If FINN changes its page structure or the data it exposes, Lens may stop reading listings until it is updated.
                        </Limit>
                    </LimitGroup>

                    <LimitGroup title="How it judges">
                        <Limit title="No AI in this beta.">
                            Choices are interpreted by fixed rules, not a language model. The rules cover supported needs, costs, mileage, dates and requirements.
                        </Limit>
                        <Limit title="Some qualities can't be judged reliably.">
                            The data may not establish boot capacity with the seats up, seat comfort, crash-test results, the actual car's condition, or every
                            driver-assistance feature.
                        </Limit>
                        <Limit title="Provisional score bands.">The thresholds for Strong, Good, Partial and Limited matches haven't been finally calibrated.</Limit>
                        <Limit title="Generalized wording.">
                            Some explanations use Lens's own groupings, such as “city & parking”, rather than repeating your exact wording.
                        </Limit>
                    </LimitGroup>

                    <LimitGroup title="Costs and dates">
                        <Limit title="Estimated costs.">
                            Fuel and electricity prices are Lens assumptions, not live prices, and running costs depend on the distance you give Lens (or its
                            1,000 km a month when you don't). Parking and tolls are excluded.
                        </Limit>
                        <Limit title="Plug-in hybrids.">
                            FINN's data doesn't give their electricity consumption, so Lens uses EU registration data where it can. Some models are missing, and an
                            incomplete cost can decide whether a car qualifies under a hard budget limit.
                        </Limit>
                        <Limit title="Rental dates and terms.">
                            Many cars are offered only on a 12-month term. Fixed dates may leave few eligible cars, so Lens may offer the nearest available dates
                            instead.
                        </Limit>
                    </LimitGroup>

                    <LimitGroup title="Scale and storage">
                        <Limit title="Large listings.">
                            Lens evaluates matching cars up to its current limit of about 150 at a time. When a listing exceeds that, it says how many cars it
                            evaluated out of how many matched.
                        </Limit>
                        <Limit title="Local storage.">
                            Chats and settings stay in this browser. Lens keeps up to 40 recent chats and removes older ones. You can inspect and delete stored data in
                            Settings; uninstalling the extension removes it.
                        </Limit>
                    </LimitGroup>
                </div>

                <div className="mt-4 rounded-xl border border-dashed border-finn-black/20 p-4">
                    <h3 className="text-[13.5px] font-black text-finn-black">Not yet tested</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-finn-black/80">These may work, but nobody has checked them yet.</p>
                    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-finn-black/85">
                        <li>Using Lens in two FINN tabs at the same time. Simultaneous changes to chats may overwrite one another.</li>
                        <li>Narrow windows and phone-sized screens, where the chat becomes a full-width sheet.</li>
                        <li>Keyboard-only use and screen readers.</li>
                        <li>FINN pages other than car listings and individual car pages.</li>
                    </ul>
                </div>
            </Card>

            {/* 6. Future possibilities */}
            <Card
                id="guide-next"
                icon={<Telescope className="h-5 w-5" />}
                title="What might come next"
            >
                <div className="mb-4 inline-flex rounded-full bg-finn-warning-lift px-3 py-1 text-[12px] font-bold text-finn-warning-ink">
                    A possibility, not part of this beta
                </div>

                <Prose>
                    <p>
                        Today, Lens asks a fixed set of questions and uses keyword
                        rules to interpret typed answers. One possible next step is
                        a more natural conversation, where you describe your
                        circumstances in your own words and Lens asks follow-up
                        questions when something is unclear.
                    </p>
                    <p>
                        A language model, possibly Google's Gemini, could translate
                        that conversation into the structured answers Lens already
                        uses: needs, priorities, requirements, and constraints.
                    </p>
                    <p>
                        The scoring engine would still evaluate cars using the
                        available vehicle data. AI would help interpret what you
                        mean, rather than independently decide which car is best.
                    </p>
                    <p>
                        No AI is used in this beta, and this direction may never
                        be implemented.
                    </p>
                </Prose>
            </Card>

            {/* 7. How it was built */}
            <Card id="guide-built" icon={<Hammer className="h-5 w-5" />} title="How it was built">
                <Prose>
                    <p>
                        Finn Lens is an independent project by <strong>Orjwan Al-Rajaby</strong>. It isn't a FINN product,
                        and it isn't for sale.
                    </p>
                </Prose>

                <div className="mt-4 grid items-start gap-3 sm:grid-cols-2">
                    <Panel title="Orjwan's work">
                        <ul className="list-disc space-y-1.5 pl-5">
                            <li>The idea, and the problem it starts from.</li>
                            <li>
                                Investigating finn.com: how its pages are rendered, on the server and in the browser, and how an
                                extension can work alongside them.
                            </li>
                            <li>Working out what each field in FINN's car data means, and what it doesn't say.</li>
                            <li>
                                The product's direction, and its decision model: what Lens asks, what counts, what rules a car out,
                                and how much each answer weighs.
                            </li>
                            <li>
                                The first versions: the extension's foundation and its reading of FINN's car data (August 2026).
                            </li>
                        </ul>
                    </Panel>
                    <Panel title="Built with Claude Code">
                        <p>
                            From September 2026, Orjwan directed the development with Claude Code, Anthropic's AI coding
                            assistant, which wrote most of the code from then on: every commit in this version's history since
                            then is marked as co-authored with it. Orjwan decided what to build and what to change, and tested
                            it on finn.com.
                        </p>
                    </Panel>
                </div>

                <Prose className="mt-4">
                    <p>
                        Lens went through several designs before this one: pinning cars to compare, a settings screen of
                        priorities, and a chat answered by an AI model. The guided conversation in this beta is what that
                        led to.
                    </p>
                    <p>
                        The code is a <strong>beta codebase</strong>. It typechecks, has around 950 automated tests, and was
                        audited for this release, but it grew with the product rather than to engineering standards set up
                        front, and hasn't had the review a production product would.
                    </p>
                    <p>
                        Lens isn't published on the Chrome Web Store. This beta is shared as a package to load into Chrome
                        directly.
                    </p>
                </Prose>
            </Card>

            {/* 8. Feedback */}
            <Card
                id="guide-feedback"
                icon={<MessageSquareText className="h-5 w-5" />}
                title="Feedback and bug reports"
            >
                <Prose>
                    <p>
                        Found a bug, an incorrect result, something confusing, or
                        an idea for improvement? Send your report to{" "}
                        <strong>the person who supplied you with this beta</strong>.
                    </p>
                    <p>
                        You don't need to diagnose the problem. Describe what you
                        were trying to do, what happened, and how someone else could
                        reproduce it.
                    </p>
                </Prose>

                <div className="mt-5">
                    <h3 className="text-[14.5px] font-black text-finn-black">What to put in a report</h3>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-finn-black/80">
                        Your chats are kept only on your computer, so whoever reads your report can't open them. Lens can only be checked by doing what
                        you did, step by step. Include whatever you can, in this order:
                    </p>

                    <ol className="mt-3 space-y-2">
                        <FeedbackItem n={1} title="What kind of issue it is">
                            <strong>A bug</strong>: something broke, didn't respond, or behaved unexpectedly. Or <strong>a faulty or incomplete result</strong>:
                            a pick or score looks wrong, something is missing, or the explanation doesn't match the recommendation. Suggestions are welcome too.
                        </FeedbackItem>
                        <FeedbackItem n={2} title="Steps to reproduce it">
                            <ul className="mt-1 list-disc space-y-1 pl-5">
                                <li>The full finn.com address you were on, including any filters you'd set.</li>
                                <li>Each answer you gave Lens, in order, whether you tapped it or typed it.</li>
                                <li>
                                    Anything you changed under <strong>This doesn't look right</strong>: items taken out or added, how much something counts, answers
                                    changed.
                                </li>
                                <li>What you did after the result, such as opening a car's drawer or changing your answers.</li>
                            </ul>
                        </FeedbackItem>
                        <FeedbackItem n={3} title="What happened">
                            What Lens showed or did, the car it concerns, and any error message.
                        </FeedbackItem>
                        <FeedbackItem n={4} title="What you expected">
                            What you thought should happen instead, and why.
                        </FeedbackItem>
                        <FeedbackItem n={5} title="Screenshots and the PDF">
                            Screenshots of the chat and the page. For a result, the PDF too: click the car's chip and choose <strong>Save as PDF</strong> in its
                            drawer.
                        </FeedbackItem>
                        <FeedbackItem n={6} title="Anything else that might help">
                            Your browser and its version, and anything you noticed along the way. This is Lens {version}.
                        </FeedbackItem>
                    </ol>
                </div>

                <div className="mt-4 rounded-xl bg-finn-pale-blue/70 p-4">
                    <div className="flex items-start gap-2">
                        <Lightbulb
                            aria-hidden="true"
                            className="mt-0.5 h-4 w-4 shrink-0 text-finn-accent-blue"
                        />
                        <div className="text-[13px] leading-relaxed text-finn-black/85">
                            <p className="font-bold">
                                A useful report doesn't need to be technical.
                            </p>
                            <p className="mt-1">
                                For example: "I selected these answers, changed this
                                priority, and expected this car to win, but Lens picked
                                another one. Here's why I expected a different result."
                            </p>
                            <p className="mt-2">
                                A surprising result is useful even if it isn't a bug.
                                It may reveal a scoring issue, missing data, or a
                                trade-off Lens should explain more clearly.
                            </p>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
}

function LimitGroup({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="rounded-xl border border-finn-cotton bg-white p-4">
            <p className="text-[11px] font-black uppercase tracking-wide text-finn-accent-blue">{title}</p>
            <ul className="mt-2 space-y-2.5">{children}</ul>
        </div>
    );
}

function Limit({ title, children }: { title: string; children: ReactNode }) {
    return (
        <li className="text-[13px] leading-relaxed text-finn-black/85">
            <strong className="text-finn-black">{title}</strong> {children}
        </li>
    );
}

function QuickTag({ children }: { children: ReactNode }) {
    return (
        <span className="rounded-full border border-finn-cotton bg-white px-2.5 py-1 text-[11px] font-semibold text-finn-black/70">
            {children}
        </span>
    );
}

function Prose({
    children,
    className = "",
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={`space-y-3 text-[14px] leading-relaxed text-finn-black/85 ${className}`}
        >
            {children}
        </div>
    );
}

function KeyPoint({ children }: { children: ReactNode }) {
    return (
        <div className="mt-4 rounded-r-xl border-l-[3px] border-finn-accent-blue bg-finn-pale-blue/60 px-4 py-3 text-[13px] leading-relaxed text-finn-black/85">
            {children}
        </div>
    );
}

function Step({
    n,
    title,
    children,
}: {
    n: number;
    title: string;
    children: ReactNode;
}) {
    return (
        <div className="flex gap-3">
            <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-finn-highlight-navy text-[13px] font-black text-white"
            >
                {n}
            </span>

            <div className="min-w-0 flex-1">
                <h3 className="text-[14.5px] font-black leading-snug text-finn-black">
                    {title}
                </h3>
                <div className="mt-1 text-[13.5px] leading-relaxed text-finn-black/85">
                    {children}
                </div>
            </div>
        </div>
    );
}

function Panel({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    return (
        <div className="rounded-xl border border-finn-cotton bg-white p-4 text-[13.5px] leading-relaxed text-finn-black/85">
            <p className="mb-2 text-[13.5px] font-black text-finn-black">
                {title}
            </p>
            {children}
        </div>
    );
}

function Term({
    chip,
    children,
}: {
    chip: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,220px)_1fr] sm:gap-4">
            <dt className="flex items-start">{chip}</dt>
            <dd className="text-[13.5px] leading-relaxed text-finn-black/85">
                {children}
            </dd>
        </div>
    );
}

function MoreDetails({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    return (
        <details className="group rounded-xl border border-finn-cotton bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-[13px] font-bold text-finn-black transition-colors hover:bg-finn-pale-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finn-accent-blue [&::-webkit-details-marker]:hidden">
                <span>{title}</span>
                <ChevronDown
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-finn-black/55 transition-transform group-open:rotate-180"
                />
            </summary>

            <div className="border-t border-finn-cotton px-4 py-3 text-[13px] leading-relaxed text-finn-black/85">
                {children}
            </div>
        </details>
    );
}

function SourceRow({
    label,
    description,
}: {
    label: string;
    description: string;
}) {
    return (
        <div className="flex flex-col gap-3 rounded-lg bg-finn-snow p-3">
            <span className="mt-0.5 shrink-0 rounded-md bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wide text-finn-black/70">
                {label}
            </span>
            <p className="pl-2 text-[12.5px] leading-relaxed text-finn-black/75">
                {description}
            </p>
        </div>
    );
}

function FeedbackItem({ n, title, children }: { n: number; title: string; children: ReactNode }) {
    return (
        <li className="flex gap-3 rounded-xl border border-finn-cotton bg-white p-3.5">
            <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-finn-pale-blue text-[12px] font-black text-finn-accent-blue">
                {n}
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-black text-finn-black">{title}</p>
                <div className="mt-0.5 text-[13px] leading-relaxed text-finn-black/85">{children}</div>
            </div>
        </li>
    );
}
