import type { ReactNode } from "react";
import { BookOpen, Compass, FlaskConical, Lightbulb, ListChecks, MessageSquareText, Scale, Telescope } from "lucide-react";

import { BandChip, WinnerChip } from "@/components/lens-parts";

import { Card } from "./Card";

/**
 * The beta guide: what Lens is, why, how it decides, how to read what it
 * says, what this beta can't do yet, what might come next, and where to say
 * what went wrong — for someone who has never seen it.
 *
 * Every claim here is one the code bears out: the numbers are the engine's
 * own (`NEED_WEIGHT`, `bands.ts`, `DEFAULT_PREFERENCES`), and the limits are
 * the ones found by trying it. What hasn't been checked is said to be
 * unchecked. Nothing here describes the AI direction as built.
 */

const SECTIONS = [
    { id: "guide-what", label: "What is Finn Lens?" },
    { id: "guide-why", label: "Why it exists" },
    { id: "guide-how", label: "How it works" },
    { id: "guide-results", label: "Understanding the results" },
    { id: "guide-beta", label: "Beta status and known limits" },
    { id: "guide-next", label: "What might come next" },
    { id: "guide-feedback", label: "Feedback" },
] as const;

export function Guide() {
    const manifest = browser.runtime.getManifest();
    const version = manifest.version_name ?? manifest.version;

    return (
        <div className="space-y-6">
            <nav aria-label="On this page" className="rounded-2xl bg-white p-4 ring-1 ring-finn-cotton">
                <p className="text-[12.5px] font-black uppercase tracking-wide text-finn-black/70">On this page</p>
                <ol className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                    {SECTIONS.map((section, index) => (
                        <li key={section.id}>
                            <a href={`#${section.id}`} className="text-[13.5px] font-bold text-finn-accent-blue underline-offset-2 hover:underline">
                                {index + 1}. {section.label}
                            </a>
                        </li>
                    ))}
                </ol>
            </nav>

            {/* -- 1 ------------------------------------------------------------ */}
            <Card id="guide-what" icon={<BookOpen className="h-5 w-5" />} title="What is Finn Lens?">
                <Prose>
                    <p>
                        Finn Lens is a browser extension for <strong>finn.com</strong>, where FINN offers cars on a monthly subscription. It helps you decide which of the cars you're
                        looking at suits <em>you</em>.
                    </p>
                    <p>
                        You tell Lens about your life: who rides with you, where and how you drive, what the car has to cope with, what you can spend and for how long. Lens then judges
                        the cars on the finn.com page against what you said. Every car gets a verdict on its card, one car is picked as the best fit, and each verdict comes with its
                        reasons.
                    </p>
                    <p>
                        Lens is <strong>unofficial</strong>. It isn't made by FINN or affiliated with it.
                    </p>
                </Prose>
            </Card>

            {/* -- 2 ------------------------------------------------------------ */}
            <Card id="guide-why" icon={<Compass className="h-5 w-5" />} title="Why it exists">
                <Prose>
                    <p>
                        finn.com's filters answer questions about the car: which fuel, which body type, what price, which equipment. They can't answer the question you actually have:{" "}
                        <em>which of these makes sense for me?</em>
                    </p>
                    <p>
                        A list of specifications doesn't weigh one thing against another. One car has the parking camera you'd use every day, another is cheaper to subscribe to but
                        costs more to run at the distance you drive, and a third can't be rented for the dates you need. Lens starts from your circumstances, works out which of the
                        equipment and figures FINN lists matter for them, and shows why one car fits you better than another, and what you'd give up by choosing it.
                    </p>
                </Prose>
            </Card>

            {/* -- 3 ------------------------------------------------------------ */}
            <Card id="guide-how" icon={<ListChecks className="h-5 w-5" />} title="How it works">
                <div className="space-y-5">
                    <Step n={1} title="You answer a few short questions">
                        <p>
                            A bubble in the corner of finn.com opens the chat. Lens asks about your life in four groups (who rides with you, where and how you drive, what the car has
                            to cope with, and what else matters), then about money and time: a monthly limit, how long you need the car and from when, and how far you drive. Last
                            come the fuels you'd consider and your deal-breakers. You can tap an answer or type one. The <strong>i</strong> beside each answer says what Lens will
                            check for it.
                        </p>
                    </Step>

                    <Step n={2} title="Lens says back what it understood">
                        <p>
                            Before it judges anything, Lens shows a summary: each thing you said, what it will check in FINN's data for it, and how much it counts. If something's
                            wrong, <strong>This doesn't look right</strong> opens a panel where you can remove or add what it checks, change how much something counts, or answer a
                            question again. You can keep your answers as settings, so new chats start from them.
                        </p>
                    </Step>

                    <Step n={3} title="Requirements set cars aside; preferences are weighed">
                        <p>There are two kinds of answer, and they do different things:</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <Panel title="Requirements: a car that misses one is ruled out">
                                <ul className="list-disc space-y-1.5 pl-5">
                                    <li>
                                        A <strong>deal-breaker</strong>: “Must have”, “Must be” or “Mustn't be”, such as an automatic gearbox or a towbar.
                                    </li>
                                    <li>The fuels you didn't pick.</li>
                                    <li>
                                        <strong>Your dates.</strong> Lens treats them as fixed until you loosen them to “a month either way” or “doesn't matter”.
                                    </li>
                                    <li>A monthly limit, if you said to keep to it.</li>
                                </ul>
                                <p className="mt-2">
                                    If FINN's data can't confirm that a car has something it must have, or that it fits your dates or a limit you said to keep to, it's set
                                    aside too. If no car meets them all, Lens asks which you could let go of, or offers the nearest dates a car here can be rented for, before
                                    it shows a pick.
                                </p>
                            </Panel>
                            <Panel title="Preferences: they add to a car's fit">
                                <p>
                                    Everything else you said becomes things Lens looks for in FINN's data. For example, “snow and ice” leads to heated seats and a heated steering
                                    wheel. Each counts at one of three levels:
                                </p>
                                <ul className="mt-2 list-disc space-y-1.5 pl-5">
                                    <li>
                                        <strong>Top priority</strong> counts twice as much as Important.
                                    </li>
                                    <li>
                                        <strong>Important</strong> is the usual level.
                                    </li>
                                    <li>
                                        <strong>Nice to have</strong> counts half as much as Important.
                                    </li>
                                </ul>
                                <p className="mt-2">
                                    A <strong>deal-sealer</strong> (“Seals it”) counts as a top priority but doesn't rule any car out.
                                </p>
                            </Panel>
                        </div>
                    </Step>

                    <Step n={4} title="Each car is scored on what you asked for, and nothing else">
                        <p>
                            A car's fit is how much of what you asked for FINN lists on it, weighted by how much each thing matters to you. Lens doesn't add priorities of its own,
                            and one car's score never depends on the other cars on the page.
                        </p>
                        <ul className="mt-2 list-disc space-y-1.5 pl-5">
                            <li>
                                Measurements (width, length, range, charging time) and CO₂ and consumption figures count on a scale, not as yes or no. Consumption is
                                measured against a reference for the car's own fuel, so a litre of petrol is never compared with a kilowatt-hour.
                            </li>
                            <li>
                                Equipment almost every FINN car has, such as emergency braking, earns nothing extra. A car FINN says lacks it loses for the gap.
                            </li>
                            <li>
                                <strong>Unknown isn't no.</strong> If FINN's data says a car doesn't have something, that counts against it. If FINN's data doesn't say either
                                way, it's left out of the score, and Lens tells you when it could change the result.
                            </li>
                        </ul>
                    </Step>

                    <Step n={5} title="Money decides who may win, not who's best">
                        <p>
                            A cheap car doesn't score higher for being cheap. Cost decides which cars are allowed to win: a car over your limit can't be the pick while one within it
                            exists. Each car's monthly cost is estimated from three parts:
                        </p>
                        <ul className="mt-2 list-disc space-y-1.5 pl-5">
                            <li>FINN's monthly price, VAT included, on the shortest FINN term that covers your dates.</li>
                            <li>
                                Fuel or charging, from the car's official consumption at assumed prices: petrol €1.75 a litre, diesel €1.70, electricity €0.32 a kWh.
                            </li>
                            <li>
                                The FINN mileage package your distance needs. FINN's price includes 500 km a month, and Lens assumes 1,000 km when your answers don't make
                                distance matter.
                            </li>
                        </ul>
                    </Step>

                    <Step n={6} title="Where the facts come from">
                        <p>
                            Lens uses FINN's own data for each car: equipment, measurements, consumption and CO₂, prices, terms and delivery windows. Where FINN has no figure,
                            it uses a published European source and links it where the figure is shown: the EU's registration data for a plug-in hybrid's electricity use, and
                            Germany's CO₂ label rules for the A–G classes. Lens's own assumptions, like the fuel prices above, are labelled as assumptions wherever they're used.
                        </p>
                    </Step>
                </div>
            </Card>

            {/* -- 4 ------------------------------------------------------------ */}
            <Card id="guide-results" icon={<Scale className="h-5 w-5" />} title="Understanding the results">
                <Prose>
                    <p>After judging, every car on the page wears a chip on its FINN card:</p>
                </Prose>
                <dl className="mt-3 divide-y divide-finn-cotton overflow-hidden rounded-2xl bg-white ring-1 ring-finn-cotton">
                    <Term chip={<WinnerChip />}>Lens's pick: the car that fits what you said best, among the cars allowed to win.</Term>
                    <Term chip={<WinnerChip label="Closest match" />}>
                        The pick when nothing on the page fits your budget, your dates or a deal-breaker you kept. It's the nearest thing, not a match, and Lens says which limit
                        it misses.
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
                        How well the car fits what you said, from 65 out of 100 for Strong down to under 25 for Limited, with its place in the ranking (#2, #3 and so on). “Over
                        budget” is added when it's over your limit.
                    </Term>
                    <Term chip={<BandChip band="unknown" label="Not enough data" />}>FINN's data doesn't cover enough of your top two priorities to judge the car.</Term>
                    <Term chip={<BandChip band="unknown" label="Ruled out" />}>The car breaks one of your requirements. Its drawer says which one.</Term>
                </dl>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Panel title="What a result tells you">
                        <ul className="list-disc space-y-1.5 pl-5">
                            <li>How the cars on this page compare on the things you told Lens, using what FINN publishes about them.</li>
                            <li>
                                Why the pick won and what you'd give up by choosing it. Click any chip for that car's case, or “See why” in the chat. Any car that wasn't ruled
                                out can be saved as a PDF.
                            </li>
                            <li>What could change the result, where FINN's data is missing something that matters.</li>
                        </ul>
                    </Panel>
                    <Panel title="What it doesn't tell you">
                        <ul className="list-disc space-y-1.5 pl-5">
                            <li>
                                Whether a car is good in general. Two people get different results for the same car, because the score measures fit to your answers, not quality.
                            </li>
                            <li>
                                Anything FINN doesn't publish: reliability, crash-test results, seat comfort, how it drives, or the condition and history of the car you'd
                                actually receive.
                            </li>
                            <li>
                                Your real running costs. The monthly figure is an estimate, and parking and tolls aren't in it.
                            </li>
                        </ul>
                    </Panel>
                </div>

                <Prose className="mt-4">
                    <p>
                        A result comes from three things: the current model, FINN's data at the moment of judging, and your answers. Change any of them and the result can change.
                        Before you subscribe, check the price, term, delivery date and equipment on the car's own FINN page. <strong>View on FINN</strong> in each car's drawer
                        takes you there.
                    </p>
                </Prose>
            </Card>

            {/* -- 5 ------------------------------------------------------------ */}
            <Card id="guide-beta" icon={<FlaskConical className="h-5 w-5" />} title="Beta status and known limits">
                <Prose>
                    <p>
                        This is a <strong>beta</strong> (version {version}). Lens is still being tried out, and it may have bugs or give a result that looks wrong. If it does,
                        please say so (see Feedback below).
                    </p>
                </Prose>

                <h3 className="mt-5 text-[14.5px] font-black">Confirmed limits</h3>
                <ul className="mt-2 list-disc space-y-2 pl-5 text-[13.5px] leading-relaxed text-finn-black/85">
                    <li>
                        <strong>Chrome on a computer only.</strong> Other browsers, including Firefox, haven't been tested.
                    </li>
                    <li>
                        <strong>English only</strong>, on finn.com's German site.
                    </li>
                    <li>
                        <strong>It depends on finn.com as it is today.</strong> If FINN changes its pages or its data, Lens may stop reading cars until it's updated.
                    </li>
                    <li>
                        <strong>Typed messages are read by fixed keyword rules, not by AI.</strong> They understand needs, money, distance and deal-breakers, but not dates.
                        Lens says when it didn't catch something, and every question can be answered by tapping.
                    </li>
                    <li>
                        <strong>Costs are estimates.</strong> The fuel and electricity prices are Lens's own assumptions and aren't yet taken from a published source. Parking
                        and tolls aren't included.
                    </li>
                    <li>
                        <strong>Plug-in hybrids:</strong> FINN doesn't list their electricity use, so Lens takes it from EU registration data. Some models aren't in that data
                        yet. Their cost is then incomplete, and Lens says so. Under a limit you said to keep to, they're set aside.
                    </li>
                    <li>
                        <strong>Some things aren't judged</strong> because FINN's data can't settle them: boot space (FINN's figure doesn't say whether the seats are up),
                        seat comfort and crash-test results. Where FINN doesn't publish a car's driver-assistance level, Lens says the result could depend on it.
                    </li>
                    <li>
                        <strong>Many FINN cars are offered only on a 12-month term.</strong> Because dates count as fixed until you loosen them, a longer rental can leave few
                        cars. Lens then offers the nearest dates a car on the page can be rented for.
                    </li>
                    <li>
                        <strong>Broad searches:</strong> on a filtered listing Lens judges the matching cars, up to about 150 at a time. When more match, it says how many it
                        judged and how many there are.
                    </li>
                    <li>
                        <strong>The score bands are provisional.</strong> Where Strong, Good, Partial and Limited begin hasn't been finally calibrated.
                    </li>
                    <li>
                        <strong>Wording:</strong> a car's drawer sometimes names Lens's own groupings (for example “city & parking”) rather than only the words you used.
                    </li>
                    <li>
                        <strong>Storage:</strong> everything stays in this browser. Lens keeps your 40 most recent chats, and older ones are let go. Settings shows all of it and
                        can delete any of it, and uninstalling Lens removes it.
                    </li>
                </ul>

                <h3 className="mt-5 text-[14.5px] font-black">Not yet checked</h3>
                <ul className="mt-2 list-disc space-y-2 pl-5 text-[13.5px] leading-relaxed text-finn-black/85">
                    <li>Other Chromium browsers, such as Edge or Brave. They're likely to work, but haven't been tried.</li>
                    <li>Using Lens in two finn.com tabs at the same time. Changes made to chats in both at once might overwrite one another.</li>
                    <li>Narrow windows and phone-sized screens, where the chat becomes a full-width sheet.</li>
                    <li>Keyboard-only use and screen readers.</li>
                    <li>finn.com pages other than car listings and a car's own page.</li>
                </ul>
            </Card>

            {/* -- 6 ------------------------------------------------------------ */}
            <Card id="guide-next" icon={<Telescope className="h-5 w-5" />} title="What might come next">
                <p className="mb-3 inline-flex rounded-full bg-finn-warning-lift px-3 py-1 text-[12.5px] font-black text-finn-warning-ink">
                    A direction being explored. Not part of this beta.
                </p>
                <Prose>
                    <p>
                        Today Lens asks a fixed set of questions, and reads typed words with simple keyword rules. The aim is a more natural conversation: you'd describe your
                        situation in your own words (“two kids, a dog, and a long commute on the motorway”), Lens would ask follow-up questions where something is unclear, and you
                        could refine what you need as you go.
                    </p>
                    <p>
                        An AI language model, possibly Google's Gemini, could do the understanding: turning the conversation into the same structured answers Lens uses now (needs,
                        how much each counts, limits and deal-breakers). The engine would still do the judging. It would score the cars and pick the winner exactly as it does
                        today, from FINN's data. The AI would help interpret what you mean, not decide which car is best.
                    </p>
                    <p>No AI is used in this beta, and there's no promise this will ship.</p>
                </Prose>
            </Card>

            {/* -- 7 ------------------------------------------------------------ */}
            <Card id="guide-feedback" icon={<MessageSquareText className="h-5 w-5" />} title="Feedback">
                <Prose>
                    <p>
                        Bugs, results that look wrong or confusing, and suggestions are all welcome. Please send them to <strong>the person who sent you this build</strong>.
                    </p>
                    <p>These make a report quickest to trace:</p>
                </Prose>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-finn-black/85">
                    <li>A screenshot.</li>
                    <li>The address of the finn.com page you were on.</li>
                    <li>The chat's name, shown under “Lens” at the top of the chat (for example “Chat 7KQ-M4X”).</li>
                    <li>What you expected, and what Lens said instead.</li>
                    <li>The version: {version}.</li>
                </ul>
                <div className="mt-4 flex items-start gap-2 rounded-2xl bg-finn-pale-blue p-4 text-[13px] leading-relaxed text-finn-black/85">
                    <Lightbulb aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-finn-accent-blue" />
                    <p>
                        A result that surprised you is as useful to hear about as a crash. Saying which car you expected to win, and why, helps tell a bug from a judgement call.
                    </p>
                </div>
            </Card>
        </div>
    );
}

function Prose({ children, className = "" }: { children: ReactNode; className?: string }) {
    return <div className={`space-y-3 text-[14px] leading-relaxed text-finn-black/85 ${className}`}>{children}</div>;
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
    return (
        <div className="flex gap-3">
            <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-finn-highlight-navy text-[13px] font-black text-white">
                {n}
            </span>
            <div className="min-w-0 flex-1">
                <h3 className="text-[14.5px] font-black leading-snug">{title}</h3>
                <div className="mt-1 text-[13.5px] leading-relaxed text-finn-black/85">{children}</div>
            </div>
        </div>
    );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="rounded-2xl bg-white p-4 text-[13.5px] leading-relaxed text-finn-black/85 ring-1 ring-finn-cotton">
            <p className="mb-2 text-[13.5px] font-black text-finn-black">{title}</p>
            {children}
        </div>
    );
}

function Term({ chip, children }: { chip: ReactNode; children: ReactNode }) {
    return (
        <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,220px)_1fr] sm:gap-4">
            <dt className="flex items-start">{chip}</dt>
            <dd className="text-[13.5px] leading-relaxed text-finn-black/85">{children}</dd>
        </div>
    );
}
