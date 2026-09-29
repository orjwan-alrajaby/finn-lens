import type {
    AskRequest,
    AskResult,
    ConverseRequest,
    ConverseResult,
    InterpretRequest,
    InterpretResult,
    NeedImportance,
    ProposedChange,
    ScopeKind,
    WireNeed,
    WireQuestion,
    WireUnderstanding,
} from "./contract";
import type { Answered, LensAiAdapter } from "./contract";

/**
 * Lens AI without a model: a stand-in for Gemini, for trying the chat when
 * the free quota is spent.
 *
 * It reads a message with plain keyword rules and answers in the same shapes
 * the real model does — needs with evidence and a use clause, constraints,
 * context, capabilities, what Lens can't judge, one question, offers, answers
 * from the facts, what-ifs, corrections, scope — so everything after the
 * model runs for real: `readUnderstanding`, grounding, the question filter,
 * the engine, the story. It never ranks anything, exactly like the model.
 *
 * It is not clever, and isn't meant to be. It covers the behaviours seen from
 * the live model in the round-two conversations, so each part of the chat can
 * be exercised on purpose. A few messages provoke the model's known failure
 * modes, to check Lens's guards still catch them:
 *
 *   mock:bad-quote       an answer quoting German FINN never wrote
 *   mock:invented-age    a reply stating children's ages nobody gave
 *   mock:empty           a reply with nothing in it
 *   mock:slow            a six-second wait, for the thinking state
 */

/* -------------------------------------------------------------------------- */
/* Reading a message                                                          */
/* -------------------------------------------------------------------------- */

interface Evidence {
    id: string;
    use: string;
    unwanted?: boolean;
    mustHave?: boolean;
}

interface NeedRule {
    id: string;
    label: string;
    importance: NeedImportance;
    said: string;
    priorities: string[];
    evidence: Evidence[];
    notInData?: string | null;
}

/** A message in clauses, so "I hate parking, but I don't want a huge car" reads as two things. */
const clausesOf = (message: string): string[] =>
    message
        .replace(/[’`]/g, "'")
        .split(/(?<=[.!?;])\s+|,\s*(?:but|though|although|while)\s+|\s+but\s+/i)
        .map((clause) => clause.trim())
        .filter(Boolean);

const REJECTS = /\b(don't|do not|doesn't|never)\s+(want|give me|like)\b|\bplease don't\b|\bnot an?\b|\bno\s+(suvs?|seven|big|huge)|\bhate\b|\bavoid\b/i;
const NOT_NEEDED = /\b(don't|do not)\s+(need|care|really care|mind)\b|\bnot bothered\b|\bno need for\b|\brather have something boring\b/i;

const has = (text: string, pattern: RegExp) => pattern.test(text);

/** Numbers that are money: a euro sign, "euros", "a month", or a budget word nearby. */
function readBudget(message: string): WireUnderstanding["budget"] {
    /* Sentences, not clauses: "around 650 is okay but I'd rather be closer to 550" is one thought. */
    const clauses = message.replace(/[’`]/g, "'").split(/(?<=[.!?;])\s+/).filter(
        (clause) =>
            /€|\beur(o|os)?\b|a month|per month|monthly|budget|afford|spend|\bpay\b|\bmax(imum)?\b|can do/i.test(clause) &&
            !/\bkm\b|kilomet/i.test(clause.replace(/\d+\s*(€|euros?)/gi, "")),
    );

    const figures = clauses.flatMap((clause) =>
        [...clause.matchAll(/€?\s?(\d{3,4})(?:[.,]\d+)?\s?(€|euros?|eur\b)?/gi)]
            .map((match) => ({ value: Number(match[1]), clause, at: match.index ?? 0 }))
            .filter((item) => item.value >= 150 && item.value <= 5000),
    );

    if (!figures.length) return null;

    const soft = /\baround\b|\babout\b|\broughly\b|\bideally\b|\bprobably\b|\bsomewhere\b|-ish\b|\bcloser to\b|\bokay\b|\bnice\b/i;
    const firm = /absolute|\bmax(imum)?\b|can't|cannot|no more than|\bunder\b|strict|at most|\blimit\b|can do|can pay|\bstill\b/i;

    /* "Around 650 is okay but I'd rather be closer to 550": the preferred figure is the one aimed at. */
    const preferred = figures.find((item) => /\b(rather|prefer|closer to|ideally)\b[^.]*$/i.test(item.clause.slice(0, item.at)));
    const stretchWord = figures.find((item) => /\b(maybe|could|stretch|if that's|at a push)\b/i.test(item.clause.slice(0, item.at + 1)));
    const ceiling = figures.find((item) => /definitely not\s*€?\s*$/i.test(item.clause.slice(0, item.at + 1).replace(/\d+$/, "")));

    const base = preferred ?? figures.find((item) => item !== stretchWord && item !== ceiling) ?? figures[0]!;
    const others = figures.filter((item) => item !== base).map((item) => item.value).filter((value) => value > base.value);
    const stretchTo = others.length ? Math.max(...others) : null;

    const text = base.clause.slice(Math.max(0, base.at - 60), base.at + 20);
    const kind: "hardMax" | "target" =
        firm.test(text) && !soft.test(text) ? "hardMax" : soft.test(text) || stretchTo ? "target" : "hardMax";

    /* A stretch on a hard figure: "400, and maybe 425" stays a line, at 400, with 425 as the most. */
    const final = stretchWord && !preferred ? "hardMax" : kind;

    return {
        kind: final,
        monthly: base.value,
        stretchTo,
        said: final === "hardMax"
            ? `€${base.value} a month is the most you'll pay${stretchTo ? `, €${stretchTo} if it really makes the difference` : ""}`
            : `you'd like to stay around €${base.value} a month${stretchTo ? `, and no more than €${stretchTo}` : ""}`,
    };
}

/** Distances into a month, the way the live model learned to: work days, weeks, regular trips. */
function readKm(message: string): WireUnderstanding["monthlyKm"] {
    const text = message.toLowerCase();
    const work = /\bwork|commut|\bjob\b/.test(text);
    let total = 0;
    const parts: string[] = [];

    const perDay = text.match(/(\d{1,3})\s?km\s?(?:a|per|each|most|every)\s?days?|(\d{1,3})\s?km\s?daily/);
    if (perDay) {
        const km = Number(perDay[1] ?? perDay[2]);
        total += km * (work ? 22 : 30);
        parts.push(`about ${km} km a day`);
    }

    const away = text.match(/(\d{1,3})\s?km\s?(away|each way)/);
    const days = text.match(/(\w+)\s+days?\s+a\s+week/);
    const dayCount = days ? ({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 } as Record<string, number>)[days[1]!] ?? Number(days[1]) : 0;
    if (away && dayCount && !perDay) {
        const km = Number(away[1]);
        total += Math.round(km * 2 * dayCount * 4.3);
        parts.push(`a ${km} km commute each way, ${dayCount} days a week`);
    }

    const trip = text.match(/(\d{2,4})\s?km\s?(trip|drive|journey)?[^.]*?(once or twice|once|twice|every couple of weekends|every few weeks)/)
        ?? text.match(/(once or twice|once|twice)[^.]*?(\d{2,4})\s?km/);
    if (trip) {
        const km = Number(/\d/.test(trip[1]!) ? trip[1] : trip[2]);
        const how = /\d/.test(trip[1]!) ? trip[3]! : trip[1]!;
        const times = how === "once or twice" ? 1.5 : how === "twice" || how === "every couple of weekends" ? 2 : 1;
        if (km >= 50) {
            total += Math.round(km * times);
            parts.push(`${km} km trips ${how}${/month/.test(how) ? "" : " a month"}`);
        }
    }

    if (!total) return null;

    return { value: Math.round(total / 10) * 10, said: parts.join(" plus ") };
}

const AGES = /\b(\d{1,2})\s*(?:,|and)\s*(\d{1,2})(?:\s*(?:,|and)\s*(\d{1,2}))?\b(?![^.]*\b(km|€|euro))/;

function readSituation(message: string, previous: WireUnderstanding) {
    const text = message.replace(/[’`]/g, "'");
    const clauses = clausesOf(text);
    const needs: NeedRule[] = [];
    const context: { label: string; said: string }[] = [];
    const capabilities: WireUnderstanding["capabilities"] = [];
    const notModelled: WireUnderstanding["notModelled"] = [];
    const droppedPriorities: string[] = [];
    const dropNeeds: string[] = [];

    const add = (rule: NeedRule) => {
        if (!needs.some((need) => need.id === rule.id)) needs.push(rule);
    };

    const electricWanted = /\b(want|like|prefer|really wants?|would like)\b[^.]*\b(electric|ev)\b/i.test(text) || /\belectric car\b/i.test(text);
    const rangeWorry = /stranded|run(ning)? out of (charge|battery)|range anxiety|worried about (the )?range/i.test(text);
    const partnerSplit = electricWanted && rangeWorry && /partner|husband|wife|girlfriend|boyfriend/i.test(text);

    for (const clause of clauses) {
        const rejects = has(clause, REJECTS);
        const notNeeded = has(clause, NOT_NEEDED);

        /* -- What they don't care about ----------------------------------- */
        if (notNeeded || /don't care about/i.test(clause)) {
            for (const [pattern, said] of [
                [/accelerat|performance|fast|speed/i, "acceleration or performance"],
                [/screen|infotainment|gadget|tech/i, "fancy screens"],
                [/pretty|looks|stylish/i, "how the car looks"],
                [/luxur/i, "luxury"],
                [/entertainment/i, "a built-in entertainment system"],
                [/boot space|much space|lots of space/i, "lots of boot space"],
            ] as const) {
                if (pattern.test(clause)) {
                    notModelled.push({ said, stance: "doesntCare", explanation: `Lens doesn't weigh ${said}, so nothing changes — it's here so you can see it was heard.` });
                }
            }
        }

        if (/lecture|environment(ally)? better|don't care about (the )?environment/i.test(clause)) droppedPriorities.push("environmental");

        /* -- Corrections ---------------------------------------------------- */
        if (/don't mind a bigger car|bigger car is fine|size doesn't matter/i.test(clause)) dropNeeds.push("nothing-too-big");
        if (/don't care about (\w+) anymore|no longer (need|care)/i.test(clause)) {
            const word = clause.match(/about (\w+) anymore/i)?.[1]?.toLowerCase();
            for (const need of previous.needs) if (word && need.label.toLowerCase().includes(word)) dropNeeds.push(need.id);
        }

        /* -- Kinds of car they reject -------------------------------------- */
        if (rejects && /seven[- ]?seater|7[- ]?seater|third row/i.test(clause)) {
            add({
                id: "five-not-seven",
                label: "Five seats, not a seven-seater",
                importance: "essential",
                said: "you need room for five but don't want a big seven-seater",
                priorities: ["practicality"],
                evidence: [
                    { id: "seatsFivePlus", use: "", mustHave: true },
                    { id: "seatsSixPlus", use: "", unwanted: true },
                    { id: "rearDoors", use: "lets the kids get in and out on their own" },
                ],
                notInData: "how comfortably three fit across the back row",
            });
        } else if ((rejects || notNeeded) && /\b(enormous|giant|massive|huge|big|large)\s+(\w+\s+)?(cars?|suvs?|vehicles?|ones?)\b/i.test(clause)) {
            /* Size, not kind: FINN files 4 m city cars as SUVs. */
            add({
                id: "nothing-too-big",
                label: "Nothing too big",
                importance: "important",
                said: /suv/i.test(clause) ? "you don't need a giant SUV" : "you don't want one of those enormous cars",
                priorities: ["cityParking"],
                evidence: [
                    { id: "compactLength", use: "fits more of the spaces you'll find" },
                    { id: "compactWidth", use: "leaves room either side in a narrow bay" },
                ],
            });
        } else if (rejects && /\bsuvs?\b/i.test(clause)) {
            add({
                id: "no-suv",
                label: "Not an SUV",
                importance: "essential",
                said: "you don't want an SUV",
                priorities: ["cityParking"],
                evidence: [{ id: "suvBody", use: "", unwanted: true }, { id: "compactLength", use: "keeps it easy to place on the road" }],
            });
        }

        if (/drive for me|drive itself|self-driving|steer (for me|itself)/i.test(clause)) {
            if (notNeeded) {
                capabilities.push({ label: "You'd rather do the driving yourself", said: "you don't need the car to drive for you", lessRelevant: ["driverAssistLevel2"] });
            } else if (rejects) {
                add({
                    id: "no-self-steering",
                    label: "A car that doesn't steer itself",
                    importance: "important",
                    said: "you don't want the car taking over",
                    priorities: [],
                    evidence: [{ id: "driverAssistLevel2", use: "", unwanted: true }],
                });
            }
        }

        /* -- What they're already good at ---------------------------------- */
        if (/(pretty good|confident|fine|comfortable)\s+(on|with|at|keeping)\s+(normal roads|motorways?|the motorway|(my|a safe)? ?distance)/i.test(clause)) {
            capabilities.push({
                label: "Confident on ordinary roads",
                said: "you're pretty good on normal roads",
                lessRelevant: ["hasAdaptiveCruiseControl", "hasLaneKeepingAssist"],
            });
        }
    }

    /* -- Needs ------------------------------------------------------------- */

    if (/small enough|something small|a small car|compact car/i.test(text)) {
        add({
            id: "nothing-too-big",
            label: "Small enough for the city",
            importance: "important",
            said: "you want something small enough for the city",
            priorities: ["cityParking"],
            evidence: [
                { id: "compactLength", use: "fits more of the spaces you'll find" },
                { id: "compactWidth", use: "leaves room either side in a narrow bay" },
            ],
        });
    }

    const parkingHate = /(hate|stress|anxious|nervous|struggle|bad at|dread)[^.]*park|park[^.]*(stress|hate|nightmare|difficult)/i.test(text);
    if (parkingHate || /\bparallel park/i.test(text)) {
        add({
            id: "parking",
            label: "Parking without the stress",
            importance: /hate|anxious/i.test(text) ? "essential" : "important",
            said: "parking stresses you out",
            priorities: ["cityParking"],
            evidence: [
                { id: "hasParkingSensors", use: "beeps faster as you get close to something you can't see" },
                { id: "hasOneEightyDegreesReversingCamera", use: "shows you what's behind while you reverse" },
                { id: "compactLength", use: "fits into more street spaces" },
            ],
        });
    }

    if (/chang(e|ing) lanes|out of nowhere beside|beside me|blind spot|overtak/i.test(text)) {
        add({
            id: "beside-you",
            label: "Cars you can't see beside you",
            importance: /anxious|hate|scared/i.test(text) ? "essential" : "important",
            said: /chang(e|ing) lanes/i.test(text) ? "changing lanes makes you anxious" : "cars appearing beside you out of nowhere worries you",
            priorities: ["safetyAssistance"],
            evidence: [
                { id: "hasBlindSpotAssist", use: "warns you about a car sitting where your mirrors don't show it" },
                { id: "hasRearCrosswalkWarning", use: "warns you about traffic crossing behind as you back out" },
            ],
        });
    }

    if (/\b(night|dark|poorly lit|unlit|\d{1,2}\s?pm)\b/i.test(text)) {
        add({
            id: "dark-roads",
            label: "Driving home in the dark",
            importance: "essential",
            said: "late drives on poorly lit roads are what you dread",
            priorities: ["safetyAssistance"],
            evidence: [
                { id: "hasMatrixLedHeadlights", use: "keeps more of the road lit without dazzling oncoming drivers" },
                { id: "hasCorneringLights", use: "lights the bend you're turning into" },
            ],
        });
    }

    if (/can't see (what's )?around|cannot see|see what's around|visibility|feel like i can't see/i.test(text)) {
        add({
            id: "see-around",
            label: "Seeing what's around you",
            importance: "essential",
            said: "you hate feeling you can't see what's around you",
            priorities: ["safetyAssistance", "cityParking"],
            evidence: [
                { id: "hasThreeSixtyDegreesCamera", use: "shows the space on every side while you manoeuvre" },
                { id: "hasBlindSpotAssist", use: "tells you when a car is beside you" },
                { id: "hasRearCrosswalkWarning", use: "warns you about traffic crossing behind you" },
            ],
            notInData: "how good the view out of the windows is",
        });
    }

    if (/back (problem|pain|issue)|bad back|driving position|posture/i.test(text)) {
        add({
            id: "your-back",
            label: "Looking after your back",
            importance: "essential",
            said: "you have back problems, so the driving position matters",
            priorities: ["comfort", "longDistance"],
            evidence: [
                { id: "hasLumbarSupport", use: "supports your lower back on longer drives" },
                { id: "hasElectricFrontSeatAdjustment", use: "lets you set the seat exactly where your back wants it" },
            ],
        });
    }

    if (/mobility|getting in and out|get in and out|difficult (for her|for him) to get/i.test(text)) {
        add({
            id: "easy-in-out",
            label: "Easy getting in and out for her",
            importance: /more important/i.test(text) ? "essential" : "important",
            said: "getting in and out is difficult for your mother",
            priorities: ["practicality", "comfort"],
            evidence: [
                { id: "rearDoors", use: "gives her a door of her own if she sits in the back" },
                { id: "hasElectricFrontSeatAdjustment", use: "lets the passenger seat be set where she can get in" },
            ],
            notInData: "seat height and how wide the doors open",
        });
    }

    const kids =
        /\b(kids?|children|child|little ones|toddlers?|baby|babies|son|daughter)\b/i.test(text) &&
        !/\b(no|don't have|without|never had)\s+(any\s+)?(kids|children)\b/i.test(text);
    const young = /little ones|toddler|baby|babies|car seats?|young (kids|children|enough)|whole production/i.test(text);
    if (kids && !needs.some((need) => need.id === "five-not-seven")) {
        add({
            id: "kids-in-and-out",
            label: young ? "Getting the little ones in and out" : "Room for the kids",
            importance: young ? "essential" : "important",
            said: young ? "getting the children into the car is a whole production" : "the kids come with you",
            priorities: ["practicality"],
            evidence: [
                { id: "rearDoors", use: "lets you reach the back seats without climbing past the front" },
                { id: "hasIsofix", use: "clips a child seat straight in" },
            ],
            notInData: young ? "how much room there is for a rear-facing seat" : null,
        });
    }

    const lotsToCarry = /luggage|\bbags\b|a lot of stuff|lots of stuff|shopping|buggy|stroller|pram|\bbikes?\b|suitcases?|boot is always full/i.test(text);
    const bootDoesntMatter = notModelled.some((item) => item.said === "lots of boot space");
    if (lotsToCarry && !bootDoesntMatter && !/\bdogs?\b/i.test(text)) {
        add({
            id: "room-to-carry",
            label: /buggy|stroller|pram/i.test(text) ? "The buggy and the shopping" : /bikes?/i.test(text) ? "Bags, and the bikes sometimes" : "Room for everything you carry",
            importance: "important",
            said: "you carry quite a lot",
            priorities: ["practicality"],
            evidence: [
                { id: "hasSplitFoldingRearSeats", use: "folds part of the back seat for the bulky things" },
                { id: "bootVolume", use: "holds the bags" },
            ],
            notInData: /buggy|stroller|pram/i.test(text) ? "whether a folded buggy fits with the seats up" : null,
        });
    }

    if (/\bdogs?\b/i.test(text)) {
        add({
            id: "the-dogs",
            label: "Room for the dogs",
            importance: "essential",
            said: "the dogs come too, with some bags",
            priorities: ["practicality"],
            evidence: [
                { id: "hasSplitFoldingRearSeats", use: "turns part of the back into floor for them" },
                { id: "bootVolume", use: "holds them and the bags" },
            ],
            notInData: "how much flat floor the boot has for dogs to lie down",
        });
    }

    if (/tablets?|phones?|devices?|plug (their|his|her) stuff|charge their/i.test(text) && !/charge at home|home charging/i.test(text.replace(/tablets?|phones?/gi, ""))) {
        add({
            id: "devices-charged",
            label: "Keeping their devices charged",
            importance: "important",
            said: "the kids' devices keep running flat on long drives",
            priorities: ["comfort"],
            evidence: [{ id: "hasBackUSBPorts", use: "lets them charge their own tablets from the back" }],
        });
    }

    const longDrives = /motorway|highway|autobahn|commut|long(er)? (trips?|drives?|journeys?)|hours? away|hour trips?|\d{3}\s?km|road trips?|visit (family|my parents|friends)/i.test(text);
    if (longDrives) {
        add({
            id: "long-drives",
            label: /commut|motorway/i.test(text) ? "The motorway commute" : "Longer trips without wearing you out",
            importance: /commut|every day|four days/i.test(text) ? "important" : "niceToHave",
            said: /commut/i.test(text) ? "most of your driving is the commute" : "you do longer trips now and then",
            priorities: ["longDistance"],
            evidence: [
                { id: "driverAssistLevel2", use: "keeps speed, distance and lane together while you supervise" },
                { id: "hasAdaptiveCruiseControl", use: "keeps your distance from the car in front by itself" },
                { id: "hasLumbarSupport", use: "supports your back over the hours" },
            ],
        });
    }

    if (/winter|snow|\bice\b|icy|freezing|cold (morning|weather)/i.test(text)) {
        add({
            id: "winter",
            label: "Coping with winter",
            importance: "niceToHave",
            said: "you go away in winter sometimes",
            priorities: ["climateSuitability"],
            evidence: [
                { id: "hasHeatedSeats", use: "warms you up on a cold start" },
                { id: "hasHeatedSteeringWheel", use: "means no gloves on a cold morning" },
            ],
        });
    }

    if (/\bsafe(ty)?\b/i.test(text) && !needs.some((need) => need.priorities.includes("safetyAssistance"))) {
        add({
            id: "safety",
            label: /distracted/i.test(text) ? "Help when you're distracted" : "Safety that actually helps",
            importance: "important",
            said: /distracted/i.test(text) ? "the kids in the back distract you" : "safety matters to you",
            priorities: ["safetyAssistance"],
            evidence: [
                { id: "hasEmergencyBrakingAssist", use: "brakes for you if you haven't reacted" },
                { id: "hasBlindSpotAssist", use: "warns you about a car you can't see beside you" },
                { id: "hasRearCrosswalkWarning", use: "warns you about traffic crossing behind you" },
            ],
        });
    }

    if (/\bcomfort(able)?\b/i.test(text) && !/don't care about comfort/i.test(text)) {
        add({
            id: "comfort",
            label: "Comfortable over distance",
            importance: "important",
            said: "you want it comfortable",
            priorities: ["comfort"],
            evidence: [{ id: "hasLumbarSupport", use: "supports your back on longer drives" }],
            notInData: "how softly it rides",
        });
    }

    if (/efficien|economical|cheap to run/i.test(text)) {
        add({ id: "efficient", label: "Cheap to run", importance: "important", said: "you want something efficient", priorities: ["environmental"], evidence: [] });
    }

    if (electricWanted && !partnerSplit) {
        add({
            id: "electric",
            label: "Driving electric",
            importance: "essential",
            said: "you want an electric car",
            priorities: [],
            evidence: [{ id: "electricCar", use: "", mustHave: true }],
        });
    }

    /* A long trip in an electric car is a need for range, said or not. */
    if ((electricWanted || rangeWorry) && (longDrives || rangeWorry)) {
        add({
            id: "range",
            label: rangeWorry ? "Not getting stranded on long trips" : "Range for the longer trips",
            importance: rangeWorry ? "essential" : "important",
            said: rangeWorry ? "you're worried about getting stranded" : "you do longer trips in it",
            priorities: ["longDistance"],
            evidence: [{ id: "electricRange", use: "covers the trip with fewer stops" }],
        });
    }

    if (/\bautomatic\b/i.test(text) && /\b(must|has to|need|want)\b/i.test(text)) {
        add({ id: "automatic", label: "An automatic", importance: "essential", said: "it has to be an automatic", priorities: [], evidence: [{ id: "hasAutomaticTransmission", use: "", mustHave: true }] });
    }

    /* -- Context ----------------------------------------------------------- */

    const ages = text.match(AGES);
    if (kids && ages) {
        const list = [ages[1], ages[2], ages[3]].filter(Boolean);
        context.push({ label: `Kids aged ${list.slice(0, -1).join(", ")} and ${list.at(-1)}`, said: `children aged ${list.join(", ")}` });
    }
    if (/charge at home|home charging|charging at home/i.test(text)) context.push({ label: "Can charge at home", said: "you can charge at home" });
    if (/moving (from|to)|new job|small town/i.test(text)) context.push({ label: "Moving from the city to a small town", said: "you're moving to a small town for a new job" });
    if (/live alone|single|just me/i.test(text)) context.push({ label: "Mostly just you in the car", said: "it's mostly just you" });
    if (/husband works nights|works nights/i.test(text)) context.push({ label: "Driving the kids home late while your husband works nights", said: "your husband works nights" });

    return { needs, context, capabilities, notModelled, droppedPriorities, dropNeeds, electricWanted, partnerSplit, young, ages: Boolean(ages) };
}

/* -------------------------------------------------------------------------- */
/* Turning a reading into a turn                                              */
/* -------------------------------------------------------------------------- */

const asWire = (rule: NeedRule, allowed: Set<string>): WireNeed => ({
    ...rule,
    evidence: rule.evidence.filter((entry) => allowed.has(entry.id)),
    notInData: rule.notInData ?? null,
    status: "active",
});

const byLabel = <T extends { label: string }>(items: T[]): T[] =>
    items.filter((item, index) => items.findIndex((other) => other.label === item.label) === index);

/** Listed-on counts from EVIDENCE, for saying which equipment actually differs here. */
const shareOf = (request: ConverseRequest, id: string): number | null => {
    const match = request.evidence.find((item) => item.id === id)?.listedOn.match(/(\d+) of (\d+)/);

    return match ? Number(match[1]) / Math.max(Number(match[2]), 1) : null;
};

const question = (ask: string, why: string, options: string[], affects: string[]): WireQuestion => ({ ask, why, options, affects });

function tensionFor(needs: WireNeed[], budget: WireUnderstanding["budget"]): string {
    const ids = new Set(needs.map((need) => need.id));
    const small = ids.has("parking") || ids.has("nothing-too-big") || ids.has("no-suv");
    const carries = ids.has("room-to-carry") || ids.has("the-dogs") || ids.has("five-not-seven");

    if (small && carries) return "The shorter the car, the less it carries — easy parking and room for everything pull in opposite directions.";
    if (ids.has("range") && (ids.has("electric") || ids.has("long-drives"))) return "Range on the longer trips is where an electric car will be tested.";
    if (ids.has("easy-in-out") && ids.has("long-drives")) return "A car that's easy for her to get into and one that's easy on a daily motorway commute aren't always the same car.";
    if (budget && budget.monthly <= 450 && needs.length >= 2) return "The budget, more than the equipment list, will decide most of this.";

    return "";
}

function replyFor(
    request: ConverseRequest,
    u: WireUnderstanding,
    added: WireNeed[],
    answering: boolean,
): string {
    const message = request.message;
    const firstNeeds = (added.length ? added : u.needs.filter((need) => need.status === "active")).slice(0, 2).map((need) => need.label.toLowerCase());
    const situation = firstNeeds.length > 1 ? `${firstNeeds[0]} and ${firstNeeds[1]}` : firstNeeds[0] ?? "what you need";
    const money = u.budget
        ? u.budget.kind === "hardMax"
            ? `€${u.budget.monthly} is a firm ceiling${u.budget.stretchTo ? `, €${u.budget.stretchTo} at a push` : ""}`
            : `around €${u.budget.monthly}${u.budget.stretchTo ? `, €${u.budget.stretchTo} at most` : ""}`
        : "";

    /* A question inside the message is answered first, from what Lens does with it. */
    if (/does (that|this|the move) change|i don't know if|would it make sense|what kind of car makes sense/i.test(message) && u.monthlyKm && u.monthlyKm.value > 500) {
        return `Your commute puts you at around ${u.monthlyKm.value.toLocaleString("en-GB")} km a month, well past the 500 km FINN includes, so extra-mileage pricing will be part of every car's cost — that matters more than the shape of the car.`;
    }

    if (/don't (really )?know (what|which) (safety|features)/i.test(message)) {
        const common = ["hasEmergencyBrakingAssist", "hasLaneKeepingAssist"].filter((id) => (shareOf(request, id) ?? 0) >= 0.9);
        const differs = ["hasBlindSpotAssist", "hasRearCrosswalkWarning"].filter((id) => (shareOf(request, id) ?? 1) < 0.9);

        if (common.length && differs.length) {
            return `${situation.charAt(0).toUpperCase()}${situation.slice(1)}${money ? ` — ${money}` : ""}. On safety, nearly every car here brakes for you in an emergency; ${differs.length > 1 ? "blind-spot warning and rear cross-traffic alert are" : "blind-spot warning is"} what actually differs.`;
        }
    }

    if (answering) return `That settles it — Lens will look at ${situation}${money ? `, within ${u.budget!.kind === "hardMax" ? "your" : "roughly your"} €${u.budget!.monthly}` : ""}.`;

    if (/^\s*(actually|oh,? and|wait)\b|\bi forgot\b|changed my mind/i.test(message) && added.length) {
        return `${added[0]!.label} now comes first${money ? ` — and ${money}` : ""}.`;
    }

    if (/^\s*(and )?actually don't increase|still the (absolute )?max/i.test(message) && u.budget) return `€${u.budget.monthly} stays the ceiling, whatever else changes.`;

    return `${situation.charAt(0).toUpperCase()}${situation.slice(1)}${money ? ` — and ${money}` : ""}.`;
}

/* "Rear USB ports" in a sentence, not "rear usb ports". */
const phrase = (label: string) => label.replace(/^[A-Z](?=[a-z])/, (letter) => letter.toLowerCase());

/** What a message answers about the cars, read from the facts Lens sent. */
function answerFromFacts(request: ConverseRequest): string {
    const facts = (request.facts ?? {}) as {
        recommendation?: { car?: string; reasons?: string[] };
        whatYouGiveUp?: { headline?: string; explanation?: string[] }[];
        costExplanation?: { cheapestFullyCosted?: { car: string; total: number } | null };
        evidenceForYourNeeds?: { car: string; withinYourConstraints: boolean; evidence: Record<string, string> }[] | null;
        finnsOwnEquipmentText?: { car: string; finnWrites: { group: string; text: string }[] }[];
    };
    const message = request.message.toLowerCase();
    const car = facts.recommendation?.car ?? "this car";

    if (message.includes("mock:bad-quote")) {
        return `FINN writes "Rücksitz-Unterhaltungssystem mit Doppelbildschirm" for the ${car}, a rear entertainment system with two screens.`;
    }

    /* Equipment asked about in everyday words, and the label Lens gives it. */
    const topics: [RegExp, string][] = [
        [/charge|plug|usb|tablet|phone/, "Rear USB ports"],
        [/blind ?spot|beside|lane/, "Blind spot warning"],
        [/camera|360|see around/, "360° camera"],
        [/revers/, "Reversing camera"],
        [/heat(ed)? seat/, "Heated seats"],
        [/steering wheel/, "Heated steering wheel"],
        [/lumbar|back/, "Lumbar support"],
        [/headlight|dark|night/, "Matrix LED headlights"],
        [/boot|luggage|bags/, "Boot space"],
        [/range|stranded|far/, "Electric range"],
    ];

    const topic = topics.find(([pattern]) => pattern.test(message))?.[1];
    const rows = facts.evidenceForYourNeeds ?? [];
    const mine = rows.find((row) => row.car === car) ?? rows[0];

    if (topic && mine && topic in mine.evidence) {
        const state = mine.evidence[topic]!;
        const others = rows.filter((row) => row !== mine && row.withinYourConstraints && row.evidence[topic] === "listed").map((row) => row.car);

        if (state === "listed") return `Yes — FINN lists ${phrase(topic)} for the ${car}${topic === "Rear USB ports" ? ", so the kids could charge their own tablets in the back" : ""}.`;
        if (state === "notListed") return `FINN doesn't list ${phrase(topic)} for the ${car}.${others.length ? ` The ${others[0]} does, and it's within your limits.` : " None of the other cars within your limits lists it either."}`;
        if (state === "unknown") return `FINN doesn't say whether the ${car} has ${phrase(topic)}, so Lens can't tell you either way.`;

        return `FINN gives ${state} for the ${car}.`;
    }

    if (/give up|giving up|trade|compromise|miss out/.test(message)) {
        const [first] = facts.whatYouGiveUp ?? [];
        return first ? `${first.explanation?.[0] ?? first.headline}` : `Lens doesn't see a clear compromise with the ${car} on what you told it.`;
    }

    if (/cheap|cost|price|expensive/.test(message)) {
        const cheapest = facts.costExplanation?.cheapestFullyCosted;
        return cheapest ? `The cheapest fully costed car here is the ${cheapest.car}, at about €${Math.round(cheapest.total)} a month.` : "Lens couldn't fully cost any car here.";
    }

    if (/why/.test(message)) return facts.recommendation?.reasons?.[0] ?? `FINN's data doesn't give Lens a clear reason to put it into words.`;

    /*
     * Anything else is answered from FINN's own equipment prose, quoted
     * exactly — which is what the real model does, and what Lens checks.
     */
    const words = facts.finnsOwnEquipmentText?.find((item) => item.car === car) ?? facts.finnsOwnEquipmentText?.[0];
    const entry = words?.finnWrites.find((item) => item.text.length > 8);
    const item = entry?.text.split(/[,;•\n]/).map((part) => part.trim()).find((part) => part.length >= 6 && part.length <= 60 && !/"/.test(part));

    if (words && entry && item) {
        return `Here's something FINN lists that the checklist doesn't: under "${entry.group}" it writes "${item}" for the ${words.car}. Nothing in that prose is scored — it only explains the car.`;
    }

    return "FINN's data doesn't settle that, so Lens can't say — ask about something the listing covers, like equipment, cost or range.";
}

function scopeIn(message: string, request: { scope?: ConverseRequest["scope"] }): ScopeKind | null {
    const available = new Set(request.scope?.available.filter((item) => item.count > 0).map((item) => item.kind) ?? []);
    const wanted: ScopeKind | null = /pinned|my cars/i.test(message)
        ? "pinned"
        : /\bthis car\b|\bthis one\b/i.test(message)
          ? "thisCar"
          : /these cars|on this page|which of these/i.test(message)
            ? "page"
            : null;

    return wanted && available.has(wanted) && wanted !== request.scope?.current ? wanted : null;
}

/*
 * The tour.
 *
 * Whatever the reader types, the stand-in walks every part of the chat in the
 * same order, so all of it can be seen and tried: it reads the message (with a
 * rich situation filled in if the message gave it little), asks a question
 * and offers equipment, recalibrates on the answer and asks a second
 * question, recalibrates again with one more offer, and then Lens is ready to
 * compare. After the comparison, questions are answered from the facts —
 * FINN's own words included — and anything else becomes a what-if.
 */
const TOUR_FIRST = question(
    "What part of driving makes you most nervous — parking, changing lanes, or busy traffic?",
    "Lens checks different assistance for each, and the cars here differ on it.",
    ["Parking", "Changing lanes", "Busy traffic", "I don't mind"],
    ["hasBlindSpotAssist", "hasThreeSixtyDegreesCamera", "hasRearCrosswalkWarning"],
);

const TOUR_SECOND = question(
    "How often are the longer drives — the ones over an hour?",
    "It decides how much motorway assistance and seat support count against city size.",
    ["Every week", "About once a month", "Hardly ever"],
    ["driverAssistLevel2", "hasLumbarSupport"],
);

/** The situation filled in when a first message gives the tour too little to show. */
const TOUR_BASE: NeedRule[] = [
    {
        id: "parking",
        label: "Parking without the stress",
        importance: "important",
        said: "parking is the part you'd most like to be easier",
        priorities: ["cityParking"],
        evidence: [
            { id: "hasParkingSensors", use: "beeps faster as you get close to something you can't see" },
            { id: "hasOneEightyDegreesReversingCamera", use: "shows you what's behind while you reverse" },
            { id: "compactLength", use: "fits into more street spaces" },
        ],
    },
    {
        id: "beside-you",
        label: "Cars you can't see beside you",
        importance: "important",
        said: "a car appearing beside you out of nowhere is what you'd rather not deal with",
        priorities: ["safetyAssistance"],
        evidence: [
            { id: "hasBlindSpotAssist", use: "warns you about a car sitting where your mirrors don't show it" },
            { id: "hasRearCrosswalkWarning", use: "warns you about traffic crossing behind as you back out" },
        ],
    },
    {
        id: "room-to-carry",
        label: "Room for everything you carry",
        importance: "important",
        said: "there's usually a lot to fit in",
        priorities: ["practicality"],
        evidence: [
            { id: "hasSplitFoldingRearSeats", use: "folds part of the back seat for the bulky things" },
            { id: "bootVolume", use: "holds the bags" },
        ],
        notInData: "whether a folded buggy fits with the seats up",
    },
    {
        id: "long-drives",
        label: "Longer trips without wearing you out",
        importance: "niceToHave",
        said: "there are longer drives now and then",
        priorities: ["longDistance"],
        evidence: [
            { id: "driverAssistLevel2", use: "keeps speed, distance and lane together while you supervise" },
            { id: "hasLumbarSupport", use: "supports your back over the hours" },
        ],
    },
];

function converse(request: ConverseRequest): ConverseResult {
    const message = request.message;
    const previous = request.understanding;
    const allowed = new Set(request.evidence.map((item) => item.id));
    const scope = scopeIn(message, request);
    const asking = /\?\s*$|^(does|do|is|are|which|why|what|how|can|could)\b/i.test(message.trim());
    const hypothetical = /\bwhat if\b|\bwould .* if\b|\bsuppose\b/i.test(message);

    /* -- A question about the result -------------------------------------- */
    if (request.facts && asking && !hypothetical && !/i have|i drive|my (kids|husband|wife|partner)/i.test(message)) {
        return { kind: "answer", reply: answerFromFacts(request), understanding: null, question: null, suggestions: [], scope };
    }

    /*
     * After a comparison, something that isn't a question and doesn't change
     * the reader's situation is tried as a what-if, so that card can be seen:
     * the budget moved up a notch, or else the least important need set aside.
     */
    const changesSomething = readSituation(message, previous).needs.length > 0 || readBudget(message) != null || /actually|anymore|instead|forgot/i.test(message);

    if (request.facts && !asking && !hypothetical && !changesSomething) {
        if (previous.budget) {
            const monthly = previous.budget.monthly + 100;

            return {
                kind: "whatIf",
                reply: `Want me to see what €${monthly} a month would change?`,
                understanding: { ...previous, budget: { ...previous.budget, monthly, stretchTo: null, said: `what if you could spend €${monthly}` }, cleared: [] },
                question: null,
                suggestions: [],
                scope: null,
            };
        }

        const least = [...previous.needs].filter((need) => need.status === "active").sort((a, b) => IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance])[0];

        if (least) {
            return {
                kind: "whatIf",
                reply: `Want me to try it as if ${least.label.toLowerCase()} didn't matter, and see what moves?`,
                understanding: { ...previous, needs: previous.needs.map((need) => (need.id === least.id ? { ...need, status: "dropped" } : need)), cleared: [] },
                question: null,
                suggestions: [],
                scope: null,
            };
        }
    }

    /* -- A what-if ----------------------------------------------------------- */
    if (hypothetical) {
        const more = message.match(/€?\s?(\d{2,4})\s?(€|euros?)?\s+more/i);
        const figure = message.match(/€\s?(\d{3,4})|(\d{3,4})\s?(€|euros?)/i);
        const current = previous.budget?.monthly ?? 0;
        const monthly = more ? current + Number(more[1]) : figure ? Number(figure[1] ?? figure[2]) : null;

        if (monthly) {
            return {
                kind: "whatIf",
                reply: `Want me to rerun the comparison with €${monthly} as your maximum?`,
                understanding: { ...previous, budget: { kind: "hardMax", monthly, stretchTo: null, said: `what if you could spend €${monthly}` }, cleared: [] },
                question: null,
                suggestions: [],
                scope: null,
            };
        }

        if (/\b(went|go|going|only) electric\b|\bif (it|we|i) (had|has) to be electric\b/i.test(message)) {
            const electric: WireNeed = { id: "electric", label: "Driving electric", importance: "essential", said: "you asked what going electric would mean", priorities: [], evidence: [{ id: "electricCar", use: "", mustHave: true }], notInData: null, status: "active" };

            return {
                kind: "whatIf",
                reply: "Want me to rerun the comparison with only the electric cars here, so you can see what changes?",
                understanding: { ...previous, needs: [...previous.needs.filter((need) => need.id !== "electric"), electric], cleared: [] },
                question: null,
                suggestions: [],
                scope: null,
            };
        }

        const word = message.match(/didn't need (?:the |a )?(\w+)|without (?:the |a )?(\w+)/i);
        const target = previous.needs.find((need) => word && need.label.toLowerCase().includes((word[1] ?? word[2] ?? "").toLowerCase()));

        if (target) {
            return {
                kind: "whatIf",
                reply: `Want me to rerun it as if ${target.label.toLowerCase()} didn't matter?`,
                understanding: { ...previous, needs: previous.needs.map((need) => (need.id === target.id ? { ...need, status: "dropped" } : need)), cleared: [] },
                question: null,
                suggestions: [],
                scope: null,
            };
        }
    }

    /* -- Answering Lens's own question ------------------------------------- */
    let answeredNeeds: NeedRule[] = [];
    const open = request.openQuestion;
    let answering = false;

    if (open) {
        answering = true;
        const reply = message.toLowerCase();

        if (/electric/i.test(open.ask)) {
            if (/electric (cars )?only|only electric/.test(reply)) {
                answeredNeeds = [{ id: "electric", label: "Driving electric", importance: "essential", said: "you settled on electric only", priorities: [], evidence: [{ id: "electricCar", use: "", mustHave: true }] }];
            }
        } else if (open.ask === TOUR_SECOND.ask) {
            const often = /week/.test(reply) ? "important" : /month/.test(reply) ? "important" : "niceToHave";

            answeredNeeds = [{ ...TOUR_BASE[3]!, importance: often as NeedImportance, said: /week/.test(reply) ? "you do longer drives every week" : /month/.test(reply) ? "you do a longer drive about once a month" : "longer drives hardly ever come up" }];
        } else if (/nervous|anxious/i.test(open.ask)) {
            if (/park/.test(reply)) answeredNeeds = [{ id: "parking", label: "Parking without the stress", importance: "essential", said: "parking is what makes you nervous", priorities: ["cityParking"], evidence: [{ id: "hasParkingSensors", use: "beeps as you get close" }, { id: "hasThreeSixtyDegreesCamera", use: "shows every side while you park" }] }];
            if (/lane/.test(reply)) answeredNeeds = [{ id: "beside-you", label: "Cars you can't see beside you", importance: "essential", said: "changing lanes is what makes you nervous", priorities: ["safetyAssistance"], evidence: [{ id: "hasBlindSpotAssist", use: "warns you about a car in your blind spot" }] }];
            if (/traffic|motorway/.test(reply)) answeredNeeds = [{ id: "busy-traffic", label: "Busy traffic", importance: "essential", said: "busy traffic is what makes you nervous", priorities: ["safetyAssistance"], evidence: [{ id: "hasAdaptiveCruiseControl", use: "keeps your distance in stop-start traffic" }, { id: "hasEmergencyBrakingAssist", use: "brakes if you don't" }] }];
        }
    }

    /* -- Reading what they said ------------------------------------------- */
    const read = readSituation(message, previous);
    const tourStep = request.answered.length + (open ? 1 : 0);
    /*
     * Only what was said. This used to pad a short first message with a stock
     * set of needs — parking, long trips, blind spots — to show the chat off
     * in a guided tour. As Lens's own reader that is Lens telling someone what
     * they need, which is the one thing it must never do.
     */
    const found = [...read.needs, ...answeredNeeds];

    const merged = new Map<string, WireNeed>(previous.needs.map((need) => [need.id, need]));
    const added: WireNeed[] = [];

    for (const rule of found) {
        const wire = asWire(rule, allowed);
        const before = merged.get(rule.id);

        merged.set(rule.id, before ? { ...before, importance: rule.importance === "essential" ? "essential" : before.importance, evidence: wire.evidence.length ? wire.evidence : before.evidence } : wire);
        if (!before) added.push(wire);
    }

    for (const id of read.dropNeeds) {
        const need = merged.get(id);
        if (need) merged.set(id, { ...need, status: "dropped" });
    }

    const budget = /don't increase the budget|still the (absolute )?max/i.test(message) && previous.budget
        ? { ...previous.budget, kind: "hardMax" as const, stretchTo: null, said: "the budget stays the absolute maximum" }
        : readBudget(message);

    const needs = [...merged.values()];
    const understanding: WireUnderstanding = {
        ...previous,
        budget: budget ?? previous.budget,
        monthlyKm: readKm(message) ?? previous.monthlyKm,
        needs,
        context: byLabel([...read.context, ...previous.context]),
        capabilities: byLabel([...read.capabilities, ...previous.capabilities]),
        droppedPriorities: [...new Set([...read.droppedPriorities, ...previous.droppedPriorities])],
        notModelled: [...read.notModelled, ...previous.notModelled],
        tension: tensionFor(needs.filter((need) => need.status === "active"), budget ?? previous.budget) || previous.tension,
        cleared: /no budget|forget the budget|no limit/i.test(message) ? ["budget"] : [],
    };

    if (message.includes("mock:invented-age")) understanding.context = [...understanding.context, { label: "Kids aged 3 and 7", said: "two children aged 3 and 7" }];

    /* -- One question, only where the answer could change the cars --------- */
    const alreadyAsked = (ask: string) => request.answered.some((item) => item.question === ask);
    let next: WireQuestion | null = null;

    if (read.partnerSplit) {
        next = question(
            "Should Lens look only at electric cars, or include petrol and hybrids too?",
            "Your partner wants electric and you're worried about range, and the cars here split on it.",
            ["Electric only", "Include petrol & hybrids", "Either is fine"],
            ["electricCar"],
        );
    } else if (/nervous|anxious|scared/i.test(message) && !/park|lane/i.test(message)) {
        next = question(
            "What part of driving makes you most nervous — parking, changing lanes, or busy traffic?",
            "Lens checks different assistance for each, and the cars here differ on it.",
            ["Parking", "Changing lanes", "Busy traffic", "I don't mind"],
            ["hasBlindSpotAssist", "hasThreeSixtyDegreesCamera", "hasRearCrosswalkWarning"],
        );
    } else if (read.young && !read.ages) {
        /* The model asks this; Lens drops it when ISOFIX is on nearly every car here. */
        next = question(
            "How old are the little ones?",
            "It decides whether rear-facing seats are part of this.",
            ["Under 1", "1 to 3", "4 or older", "I'd rather not say"],
            ["hasIsofix"],
        );
    }

    if (next && alreadyAsked(next.ask)) next = null;
    if (answering) next = null;

    /* The tour's own order: a first question, then a second once it's answered. */
    if (!request.facts) {
        if (tourStep === 0 && !next) next = TOUR_FIRST;
        if (tourStep === 1) next = alreadyAsked(TOUR_SECOND.ask) ? null : TOUR_SECOND;
    }

    /* -- Offers: what they didn't ask for, and might want ------------------ */
    const cited = new Set(needs.flatMap((need) => need.evidence.map((entry) => entry.id)));
    const declined = new Set(previous.declined ?? []);
    const offers: { id: string; why: string; needId: string }[] = [];
    const offer = (id: string, why: string, needId: string) => {
        if (allowed.has(id) && !cited.has(id) && !declined.has(id) && merged.has(needId) && offers.length < 2) offers.push({ id, why, needId });
    };

    offer("hasThreeSixtyDegreesCamera", "it shows the kerb and every side while you park", "parking");
    offer("hasElectricTailgate", "it opens the boot when your hands are full", merged.has("room-to-carry") ? "room-to-carry" : "the-dogs");
    if (merged.has("winter") && read.electricWanted) offer("hasHeatPump", "it keeps more of the range in cold weather", "winter");
    if (/bikes?/i.test(message)) offer("hasTowbar", "a rack on it carries the bikes without filling the boot", "room-to-carry");

    /* On the tour's last step, one more offer, so answering one after a question can be seen. */
    if (tourStep === 2 && !request.facts) {
        offers.length = 0;
        offer("hasHeatedSteeringWheel", "cold mornings on the longer drives get easier", "long-drives");
    }
    if (tourStep === 1 && !request.facts) offers.length = 0;

    const reply = message.includes("mock:empty")
        ? ""
        : message.includes("mock:invented-age")
          ? "Two kids aged 3 and 7 and a buggy to fit. Parking is the other thing you want easier."
          : !request.facts && tourStep === 1
            ? `Got it — ${(answeredNeeds[0]?.label ?? "that").toLowerCase()} is what I'll lean on most now. One more thing, and then I can compare.`
            : !request.facts && tourStep === 2
              ? `That settles it — ${(answeredNeeds[0]?.said ?? "that").replace(/^you /, "you ")}, so I've weighed longer trips to match. Everything's in focus.`
              : replyFor(request, understanding, added, answering);

    return {
        kind: "understanding",
        /*
         * No "before I compare, a couple of things…": the chat asks its own
         * questions, and a reply promising more would be a promise nobody
         * keeps.
         */
        reply,
        understanding,
        question: next,
        suggestions: offers,
        scope,
    };
}

/* -------------------------------------------------------------------------- */
/* The compare page's two calls                                               */
/* -------------------------------------------------------------------------- */

const emptyChange = (): ProposedChange => ({
    startFromProfile: null,
    priorityOrder: null,
    removePriorities: [],
    raise: [],
    budget: null,
    budgetWithoutFigure: null,
    monthlyKm: null,
    contractType: null,
    rentalPeriod: null,
    notRepresentable: [],
});

function changeFrom(text: string, request: InterpretRequest | AskRequest): ProposedChange {
    const change = emptyChange();
    const read = readSituation(text, { budget: null, rental: null, monthlyKm: null, needs: [], context: [], capabilities: [], droppedPriorities: [], tension: "", notModelled: [], cleared: [] });
    const categories = request.vocabulary.categories;
    const homeOf = (feature: string) => categories.find((category) => category.features.some((item) => item.id === feature))?.id;

    const order = [...new Set(read.needs.flatMap((need) => need.priorities))].filter((id) => categories.some((category) => category.id === id));
    if (order.length) change.priorityOrder = order.slice(0, 5).map((category) => ({ category, reason: read.needs.find((need) => need.priorities.includes(category))!.said }));

    for (const need of read.needs) {
        for (const entry of need.evidence) {
            const home = homeOf(entry.id);
            if (home && !entry.unwanted && !change.raise.some((item) => item.feature === entry.id) && change.raise.length < 6) {
                change.raise.push({ category: home, feature: entry.id, importance: need.importance === "essential" ? "high" : "medium", reason: need.said });
            }
        }
    }

    change.removePriorities = read.droppedPriorities.map((category) => ({ category, reason: "you said it isn't why you're choosing" }));

    const budget = readBudget(text);
    if (budget) change.budget = { action: "set", amount: budget.stretchTo ?? budget.monthly, reason: budget.said };
    else if (/cheap|afford|reasonable|expensive/i.test(text)) change.budgetWithoutFigure = "you'd rather keep the monthly cost down";

    const km = readKm(text);
    if (km) change.monthlyKm = { value: km.value, reason: km.said };

    change.notRepresentable = read.notModelled.map((item) => ({ said: item.said, explanation: item.explanation }));

    return change;
}

/* -------------------------------------------------------------------------- */
/* The adapter                                                                */
/* -------------------------------------------------------------------------- */

const pause = (message: string) =>
    new Promise((resolve) => setTimeout(resolve, message.includes("mock:slow") ? 6000 : 450 + Math.random() * 600));

const answered = <T>(result: T): Answered<T> => ({ result, model: "simulated" });

const IMPORTANCE_ORDER: Record<NeedImportance, number> = { niceToHave: 0, important: 1, essential: 2 };

export function createMockAdapter(): LensAiAdapter {
    return {
        async interpret(request) {
            await pause(request.text);

            const change = changeFrom(request.text, request);
            const empty = !change.priorityOrder && !change.raise.length && !change.budget && !change.monthlyKm;

            return answered<InterpretResult>({
                summary: empty ? "That doesn't say anything Lens can use about choosing a car." : "Here's how Lens would read that.",
                change,
                scope: scopeIn(request.text, request),
            });
        },

        async ask(request) {
            await pause(request.question);

            const more = request.question.match(/€?\s?(\d{2,4})\s?(€|euros?)?\s+more/i);
            const first = request.vocabulary.categories.find((category) => new RegExp(`cared more about ${category.label.split(" ")[0]}|${category.label.split(" ")[0]} (my )?(number one|first)`, "i").test(request.question));

            if (more) {
                return answered<AskResult>({ kind: "whatIf", answer: `I'll add €${more[1]} to your budget and run Lens again.`, change: { ...emptyChange(), budget: { action: "increaseBy", amount: Number(more[1]), reason: "you asked what €" + more[1] + " more would do" } } });
            }
            if (first) {
                return answered<AskResult>({ kind: "whatIf", answer: `I'll move ${first.label} to #1 and run Lens again.`, change: { ...emptyChange(), priorityOrder: [{ category: first.id, reason: "you asked what would happen" }] } });
            }

            const facts = request.facts as { recommendation?: { car?: string; reasons?: string[] } };

            return answered<AskResult>({
                kind: "answer",
                answer: /why/i.test(request.question) ? (facts.recommendation?.reasons?.[0] ?? "Lens's facts don't say.") : "Lens's facts don't settle that one.",
                change: null,
                scope: scopeIn(request.question, request),
            });
        },

        async converse(request) {
            await pause(request.message);

            return answered(converse(request));
        },
    };
}
