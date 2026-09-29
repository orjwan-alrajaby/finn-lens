import type { WireUnderstanding } from "@/lib/lens-ai/contract";

/**
 * Ten people, as a good model would read them.
 *
 * These are fixtures, not output: each one is what the model is asked to
 * return for a message, written by hand so the half of the pipeline that runs
 * without a model — validation, the translation into Lens's answers, the
 * engine run, the fit story — can be exercised against real situations and
 * kept honest as it changes. The messages are the ones the product was
 * stress-tested with; `scenarios.test.ts` holds each to what Lens must do
 * with it.
 */

export interface Scenario {
    id: string;
    message: string;
    reading: WireUnderstanding;
    /** A correction sent later in the same conversation, as the model would read it. */
    correction?: { message: string; reading: WireUnderstanding };
}

const base = (): Omit<WireUnderstanding, "tension" | "needs"> => ({
    budget: null,
    rental: null,
    monthlyKm: null,
    context: [],
    capabilities: [],
    droppedPriorities: [],
    notModelled: [],
    cleared: [],
});

export const SCENARIOS: Scenario[] = [
    {
        id: "city-parent",
        message:
            "I mostly drive around the city and I'm honestly terrible at parking. I have one child who is still in a car seat, and I do groceries pretty often, so I need enough room for the stuff that somehow always ends up in the car. I don't care much about having a fast car or anything fancy. I'd rather have something easy to drive and park, and I'd really like to stay under 450 euros a month.",
        reading: {
            ...base(),
            tension: "Small enough to park without thinking, but with room for a child seat and the shopping.",
            budget: { kind: "hardMax", monthly: 450, said: "you'd really like to stay under €450 a month" },
            context: [{ label: "One child in a car seat", said: "you have one child who is still in a car seat" }],
            needs: [
                {
                    id: "parking",
                    label: "Parking without the stress",
                    importance: "essential",
                    said: "you're terrible at parking",
                    priorities: ["cityParking"],
                    evidence: [
                        { id: "hasThreeSixtyDegreesCamera", use: "shows everything around the car as you park" },
                        { id: "hasParkingAssistant", use: "steers into the space for you" },
                        { id: "hasOneEightyDegreesReversingCamera", use: "shows what's behind you" },
                        { id: "compactLength", use: "fits spaces a longer car can't" },
                    ],
                    notInData: null,
                    status: "active",
                },
                {
                    id: "child-seat",
                    label: "Getting a child seat in and out",
                    importance: "important",
                    said: "your child is still in a car seat",
                    priorities: ["practicality"],
                    evidence: [
                        { id: "hasIsofix", use: "anchors the seat without seatbelt routing" },
                        { id: "rearDoors", use: "let you lift them in without folding a front seat" },
                    ],
                    notInData: null,
                    status: "active",
                },
                {
                    id: "shopping",
                    label: "Room for the weekly shop",
                    importance: "important",
                    said: "you do groceries often and things pile up in the car",
                    priorities: ["practicality"],
                    evidence: [
                        { id: "bootVolume", use: "holds the bags behind the seats" },
                        { id: "hasSplitFoldingRearSeats", use: "opens up more room when you need it" },
                    ],
                    notInData: null,
                    status: "active",
                },
            ],
            notModelled: [
                { said: "a fast car", stance: "doesntCare", explanation: "Lens doesn't weigh performance." },
                { said: "anything fancy", stance: "doesntCare", explanation: "Lens has no measure of how premium a car feels." },
            ],
        },
        correction: {
            message: "Actually, I don't care about charging devices anymore. Safety is much more important.",
            reading: {
                ...base(),
                tension: "Small enough to park without thinking, but with room for a child seat and the shopping.",
                budget: { kind: "hardMax", monthly: 450, said: "you'd really like to stay under €450 a month" },
                needs: [
                    {
                        id: "safety",
                        label: "Feeling safe with the child on board",
                        importance: "essential",
                        said: "safety matters more to you than keeping devices charged",
                        priorities: ["safetyAssistance"],
                        evidence: [
                            { id: "hasEmergencyBrakingAssist", use: "brakes for you if something appears in front" },
                            { id: "hasBlindSpotAssist", use: "warns you about a car you can't see" },
                        ],
                        notInData: null,
                        status: "active",
                    },
                ],
            },
        },
    },
    {
        id: "commuter",
        message:
            "I drive about 100 km most days for work and sometimes do 300 or 400 km trips on weekends. I really don't want to be thinking about stopping all the time, so range and comfort are important to me. I'm also pretty sensitive to road noise because I spend so much time in the car. I don't have kids and I don't need a huge boot. My budget is around 600 a month, but I could go a little higher if there is a really good reason.",
        reading: {
            ...base(),
            tension: "Going far between stops, in a car that's pleasant to sit in for hours.",
            budget: { kind: "target", monthly: 600, said: "around €600 a month, a little higher for a good reason" },
            monthlyKm: { value: 2600, said: "about 100 km on most working days, plus longer weekend trips" },
            context: [{ label: "No children", said: "you don't have kids" }],
            needs: [
                {
                    id: "range",
                    label: "Not stopping all the time",
                    importance: "essential",
                    said: "you don't want to think about stopping",
                    priorities: ["longDistance"],
                    evidence: [
                        { id: "electricRange", use: "covers a weekend trip on one charge" },
                        { id: "hasAdaptiveCruiseControl", use: "holds your speed and gap on the motorway" },
                        { id: "driverAssistLevel2", use: "keeps the car centred and paced in traffic" },
                    ],
                    notInData: null,
                    status: "active",
                },
                {
                    id: "comfort",
                    label: "Arriving without aching",
                    importance: "important",
                    said: "you spend a lot of time in the car",
                    priorities: ["longDistance", "comfort"],
                    evidence: [
                        { id: "hasLumbarSupport", use: "supports your back on a long stint" },
                        { id: "hasElectricFrontSeatAdjustment", use: "lets you find a position that lasts" },
                    ],
                    notInData: "how quiet the cabin is at speed",
                    status: "active",
                },
            ],
            notModelled: [
                { said: "sensitive to road noise", stance: "wants", explanation: "FINN doesn't publish cabin noise, so Lens can't check it." },
                { said: "I don't need a huge boot", stance: "doesntCare", explanation: "Lens doesn't score boot space." },
            ],
        },
        correction: {
            message: "What if I increase my budget by €50?",
            reading: {
                ...base(),
                tension: "Going far between stops, in a car that's pleasant to sit in for hours.",
                budget: { kind: "target", monthly: 650, said: "€50 more than before" },
                needs: [],
            },
        },
    },
    {
        id: "nervous-motorway",
        message:
            "I actually like driving, but motorways make me nervous, especially when cars are coming up beside me or when traffic suddenly slows down. I'm good at keeping a safe distance from the car in front, so I don't really need something to help with that as much as I need help with everything happening around me. I don't have any particular family requirements. I'd like something reasonably comfortable for longer drives and preferably not more than 550 euros per month.",
        reading: {
            ...base(),
            tension: "Help with what's happening beside and behind, not with the gap in front.",
            budget: { kind: "hardMax", monthly: 550, said: "preferably not more than €550 a month" },
            capabilities: [
                {
                    label: "Keeping a safe distance",
                    said: "you're good at keeping a safe distance from the car in front",
                    lessRelevant: ["hasAdaptiveCruiseControl", "driverAssistLevel2"],
                },
            ],
            needs: [
                {
                    id: "around-me",
                    label: "Knowing what's beside and behind you",
                    importance: "essential",
                    said: "cars coming up beside you on the motorway make you nervous",
                    priorities: ["safetyAssistance"],
                    evidence: [
                        { id: "hasBlindSpotAssist", use: "warns you about a car in the lane beside you" },
                        { id: "hasRearCrosswalkWarning", use: "warns about traffic crossing behind you" },
                        { id: "hasLaneKeepingAssist", use: "nudges you back if you drift while checking" },
                    ],
                    notInData: null,
                    status: "active",
                },
                {
                    id: "sudden-slowing",
                    label: "Traffic slowing suddenly",
                    importance: "important",
                    said: "traffic suddenly slowing down makes you nervous",
                    priorities: ["safetyAssistance"],
                    evidence: [{ id: "hasEmergencyBrakingAssist", use: "brakes if the car ahead stops faster than you expect" }],
                    notInData: null,
                    status: "active",
                },
                {
                    id: "long-drives",
                    label: "Comfortable on a long drive",
                    importance: "niceToHave",
                    said: "you'd like something reasonably comfortable for longer drives",
                    priorities: ["longDistance"],
                    evidence: [{ id: "hasLumbarSupport", use: "supports your back over a few hours" }],
                    notInData: null,
                    status: "active",
                },
            ],
        },
    },
    {
        id: "winter-outdoors",
        message:
            "I'll be using the car from November through March and I live somewhere where winter can be pretty unpleasant. I don't need an off-road monster, but I do want something that feels sensible when the roads are wet, icy or snowy. I also go hiking most weekends, usually with another person, so being able to throw muddy boots and bags in the car without completely destroying the interior would be nice. I don't care about having the newest technology. Around 500 euros a month would be my limit.",
        reading: {
            ...base(),
            tension: "Sure-footed in winter without buying a big off-roader.",
            budget: { kind: "hardMax", monthly: 500, said: "around €500 a month would be your limit" },
            rental: { from: "2026-11", to: "2027-03", startDay: null, said: "from November through March" },
            needs: [
                {
                    id: "winter",
                    label: "Sure-footed on wet, icy roads",
                    importance: "essential",
                    said: "winter where you live can be unpleasant",
                    priorities: ["climateSuitability"],
                    evidence: [
                        { id: "hasAllWheelDrive", use: "puts power through all four wheels when it's slippery" },
                        { id: "winterReadyTyres", use: "grip when the road is cold and wet" },
                        { id: "hasHeatedSeats", use: "warms you before the cabin does" },
                        { id: "hasRainSlashLightSensors", use: "manage wipers and lights as the weather turns" },
                    ],
                    notInData: null,
                    status: "active",
                },
                {
                    id: "muddy-kit",
                    label: "Muddy boots and bags",
                    importance: "important",
                    said: "you hike most weekends and carry muddy kit",
                    priorities: ["practicality"],
                    evidence: [
                        { id: "bootVolume", use: "takes boots and packs behind the seats" },
                        { id: "hasSplitFoldingRearSeats", use: "opens up a longer load space" },
                        { id: "hasRoofRails", use: "carry bulky kit outside the cabin" },
                    ],
                    notInData: "whether the boot has a washable liner",
                    status: "active",
                },
            ],
            notModelled: [{ said: "newest technology", stance: "doesntCare", explanation: "Lens doesn't rank cars by how new the tech is." }],
        },
    },
    {
        id: "family-road-trip",
        message:
            "We are a family of five and we're planning to use this car for a summer road trip, but it'll also be our everyday car afterwards. The kids are 3, 7 and 10, so getting everyone in and out without it becoming a daily argument would be great. We take quite a lot of luggage with us when we travel. I would also really appreciate things that make long trips easier for the kids, like somewhere to charge their devices. I can spend up to 700 euros a month, no more.",
        reading: {
            ...base(),
            tension: "Room for five and their luggage, without a daily fight getting three children in.",
            budget: { kind: "hardMax", monthly: 700, said: "you can spend up to €700 a month, no more" },
            context: [{ label: "Family of five, children 3, 7 and 10", said: "you're a family of five with children aged 3, 7 and 10" }],
            needs: [
                {
                    id: "everyone-in",
                    label: "Getting everyone in without an argument",
                    importance: "essential",
                    said: "three children have to get in and out every day",
                    priorities: ["practicality"],
                    evidence: [
                        { id: "seatsFivePlus", use: "seats all five of you" },
                        { id: "rearDoors", use: "let the children get in themselves" },
                        { id: "hasIsofix", use: "anchors the youngest one's seat" },
                    ],
                    notInData: null,
                    status: "active",
                },
                {
                    id: "luggage",
                    label: "A lot of luggage",
                    importance: "important",
                    said: "you take quite a lot of luggage when you travel",
                    priorities: ["practicality"],
                    evidence: [
                        { id: "bootVolume", use: "holds the cases with everyone aboard" },
                        { id: "hasRoofRails", use: "take the overflow on the roof" },
                    ],
                    notInData: null,
                    status: "active",
                },
                {
                    id: "kids-trips",
                    label: "Long trips easier for the kids",
                    importance: "niceToHave",
                    said: "you'd like to keep the children going on long trips",
                    priorities: ["comfort"],
                    evidence: [{ id: "hasBackUSBPorts", use: "charge their devices from the back seat" }],
                    notInData: "a built-in rear entertainment system",
                    status: "active",
                },
            ],
        },
        correction: {
            message: "My children are 2 and 4, not 7 and 10.",
            reading: {
                ...base(),
                tension: "Two child seats and their gear, in something easy to load every day.",
                context: [{ label: "Two children aged 2 and 4", said: "your children are 2 and 4" }],
                needs: [
                    {
                        id: "everyone-in",
                        label: "Getting both children in without an argument",
                        importance: "essential",
                        said: "both children are small and use seats",
                        priorities: ["practicality"],
                        evidence: [
                            { id: "hasIsofix", use: "anchors both child seats" },
                            { id: "rearDoors", use: "let you lift them in" },
                        ],
                        notInData: null,
                        status: "active",
                    },
                ],
            },
        },
    },
    {
        id: "small-car-long-trips",
        message:
            "I want something small because I mostly drive in town and I hate squeezing into parking spaces, but I also go see my parents about twice a month and that's about a 250 km drive each way. I don't want a giant car just because of those trips. I'm also not particularly interested in luxury stuff. What matters to me is that it's easy around town but doesn't become miserable when I have to spend a few hours on the motorway. I'd prefer to stay around 400 euros but I could maybe do 450.",
        reading: {
            ...base(),
            tension: "Small enough for town parking, but bearable for 250 km at a stretch.",
            budget: { kind: "target", monthly: 450, said: "around €400, maybe €450" },
            monthlyKm: { value: 1000, said: "about 250 km each way, twice a month" },
            needs: [
                {
                    id: "town",
                    label: "Easy around town",
                    importance: "essential",
                    said: "you hate squeezing into parking spaces",
                    priorities: ["cityParking"],
                    evidence: [
                        { id: "compactLength", use: "fits the spaces you have to squeeze into" },
                        { id: "compactWidth", use: "leaves room to open the door" },
                        { id: "hasParkingSensors", use: "warn you before you touch anything" },
                    ],
                    notInData: null,
                    status: "active",
                },
                {
                    id: "motorway",
                    label: "Not miserable on a long motorway run",
                    importance: "important",
                    said: "you drive 250 km each way to your parents twice a month",
                    priorities: ["longDistance"],
                    evidence: [
                        { id: "hasAdaptiveCruiseControl", use: "holds your speed and gap for hours" },
                        { id: "hasLumbarSupport", use: "supports your back on the long stretch" },
                    ],
                    notInData: null,
                    status: "active",
                },
            ],
            notModelled: [{ said: "luxury stuff", stance: "doesntCare", explanation: "Lens has no measure of luxury." }],
        },
    },
    {
        id: "rear-facing-parent",
        message:
            "I need a car for me and my two kids. They're both little, and one of them is still rear-facing, so I need to be able to get them into their seats without fighting with the car every morning. We also carry a stroller around most of the time. Other than that I'm pretty flexible. I drive mostly in town but occasionally take longer trips. My maximum is 550 euros a month.",
        reading: {
            ...base(),
            tension: "Room to fit a rear-facing seat and a stroller, in something that still parks in town.",
            budget: { kind: "hardMax", monthly: 550, said: "your maximum is €550 a month" },
            context: [{ label: "Two small children, one rear-facing", said: "both children are little and one is still rear-facing" }],
            needs: [
                {
                    id: "seats-in",
                    label: "Getting them into their seats every morning",
                    importance: "essential",
                    said: "one of them is still rear-facing",
                    priorities: ["practicality"],
                    evidence: [
                        { id: "hasIsofix", use: "anchors the seats without belt routing" },
                        { id: "rearDoors", use: "let you reach in from the side" },
                    ],
                    notInData: "how much room there is behind the front seats for a rear-facing seat",
                    status: "active",
                },
                {
                    id: "stroller",
                    label: "A stroller, most days",
                    importance: "important",
                    said: "you carry a stroller most of the time",
                    priorities: ["practicality"],
                    evidence: [
                        { id: "bootVolume", use: "takes the stroller with the seats up" },
                        { id: "hasElectricTailgate", use: "opens the boot when your hands are full" },
                    ],
                    notInData: null,
                    status: "active",
                },
            ],
        },
        correction: {
            message: "I said €500, and I really mean €500. Don't show me cars above that.",
            reading: {
                ...base(),
                tension: "Room to fit a rear-facing seat and a stroller, in something that still parks in town.",
                budget: { kind: "hardMax", monthly: 500, said: "€500 and not a euro more" },
                needs: [],
            },
        },
    },
    {
        id: "knows-nothing",
        message:
            "I know basically nothing about cars, so please don't assume I understand all the terminology. I just need something for me and my partner and maybe a dog later. Most of our driving is normal everyday stuff, but we visit family a few times a year and those trips can be pretty long. I would like something comfortable, safe and not annoying to live with. I don't really care whether it's electric or petrol or whatever, I just don't want to spend more than 500 euros a month.",
        reading: {
            ...base(),
            tension: "Easy to live with day to day, and calm on the few long trips a year.",
            budget: { kind: "hardMax", monthly: 500, said: "you don't want to spend more than €500 a month" },
            context: [{ label: "Two of you, a dog later", said: "it's you and your partner, maybe a dog later" }],
            needs: [
                {
                    id: "safe",
                    label: "Feeling safe on the road",
                    importance: "essential",
                    said: "you want something safe",
                    priorities: ["safetyAssistance"],
                    evidence: [
                        { id: "hasEmergencyBrakingAssist", use: "brakes for you if something appears in front" },
                        { id: "hasBlindSpotAssist", use: "warns you about a car you can't see beside you" },
                    ],
                    notInData: null,
                    status: "active",
                },
                {
                    id: "easy-life",
                    label: "Not annoying to live with",
                    importance: "important",
                    said: "you want something easy to live with",
                    priorities: ["comfort"],
                    evidence: [
                        { id: "hasAppleCarPlaySlashAndroidAuto", use: "puts your phone's maps and music on the car's screen" },
                        { id: "hasKeylessEntryAndStart", use: "unlocks and starts with the key in your pocket" },
                        { id: "hasAirConditioning", use: "keeps the cabin bearable in summer" },
                    ],
                    notInData: null,
                    status: "active",
                },
                {
                    id: "long-visits",
                    label: "The long trips to family",
                    importance: "important",
                    said: "you visit family a few times a year and those trips are long",
                    priorities: ["longDistance"],
                    evidence: [
                        { id: "hasAdaptiveCruiseControl", use: "keeps a set speed and gap so you're not working the pedals" },
                        { id: "hasLumbarSupport", use: "supports your back for hours at a time" },
                    ],
                    notInData: null,
                    status: "active",
                },
            ],
            notModelled: [{ said: "electric or petrol, whatever", stance: "doesntCare", explanation: "Lens compares both on what they cost you." }],
        },
    },
    {
        id: "no-big-suv",
        message:
            "I'm looking for something for my commute and general life, probably around 50 km a day. I really don't want a massive SUV. I find big cars stressful to drive and park, even though I know they're supposed to be practical. I sometimes carry two friends and occasionally some shopping, but I don't need a massive amount of space. Good visibility and things that make driving less stressful would be useful. My budget is 450 euros a month.",
        reading: {
            ...base(),
            tension: "Small and calm to drive, while still taking three people and the shopping.",
            budget: { kind: "hardMax", monthly: 450, said: "your budget is €450 a month" },
            monthlyKm: { value: 1100, said: "around 50 km a day" },
            needs: [
                {
                    id: "not-big",
                    label: "Nothing big and stressful to drive",
                    importance: "essential",
                    said: "you find big cars stressful to drive and park, and don't want a massive SUV",
                    priorities: ["cityParking"],
                    evidence: [
                        { id: "suvBody", use: "keeps you out of the big, stressful cars you'd rather not drive" },
                        { id: "compactLength", use: "keeps it short enough to place easily" },
                        { id: "compactWidth", use: "keeps it narrow in traffic and car parks" },
                    ],
                    notInData: null,
                    status: "active",
                },
                {
                    id: "visibility",
                    label: "Seeing what's around you",
                    importance: "important",
                    said: "you'd find good visibility and less stressful driving useful",
                    priorities: ["cityParking", "safetyAssistance"],
                    evidence: [
                        { id: "hasOneEightyDegreesReversingCamera", use: "shows what's behind when you reverse" },
                        { id: "hasParkingSensors", use: "warn you about what you can't see" },
                        { id: "hasBlindSpotAssist", use: "warns about a car beside you" },
                    ],
                    notInData: "how good the view out is",
                    status: "active",
                },
            ],
        },
        correction: {
            message: "I don't mind a bigger car if it makes motorway driving easier.",
            reading: {
                ...base(),
                tension: "Comfort on the motorway now matters more than staying small.",
                needs: [
                    {
                        id: "not-big",
                        label: "Nothing big and stressful to drive",
                        importance: "niceToHave",
                        said: "you don't mind a bigger car if it drives better on the motorway",
                        priorities: ["cityParking"],
                        evidence: [{ id: "compactLength", use: "keeps it short enough to place easily" }],
                        notInData: null,
                        status: "active",
                    },
                    {
                        id: "motorway",
                        label: "Easier motorway driving",
                        importance: "important",
                        said: "you'd take a bigger car if the motorway were easier",
                        priorities: ["longDistance"],
                        evidence: [{ id: "hasAdaptiveCruiseControl", use: "holds your speed and gap" }],
                        notInData: null,
                        status: "active",
                    },
                ],
            },
        },
    },
    {
        id: "winter-visitors",
        message:
            "I'm moving somewhere with proper winters in October and I'll probably have the car until spring. It'll mostly just be me, but my sister will visit with her two children and we'll probably take a few trips together. I want something that I can trust in bad weather and that won't feel cramped when they're with me. I'm not a very confident driver, especially when changing lanes, although I'm fine with normal traffic. I don't need anything luxurious and I'd rather spend my money on things that are actually useful. I was hoping to keep it below 600 euros a month.",
        reading: {
            ...base(),
            tension: "Trustworthy in winter and roomy when four of you travel, without paying for luxury.",
            budget: { kind: "hardMax", monthly: 600, said: "you hoped to keep it below €600 a month" },
            rental: { from: "2026-10", to: "2027-03", startDay: null, said: "from October until spring" },
            context: [{ label: "Sister and two children visiting", said: "your sister visits with her two children" }],
            capabilities: [{ label: "Normal traffic", said: "you're fine with normal traffic", lessRelevant: [] }],
            needs: [
                {
                    id: "bad-weather",
                    label: "Trusting it in bad weather",
                    importance: "essential",
                    said: "you're moving somewhere with proper winters",
                    priorities: ["climateSuitability"],
                    evidence: [
                        { id: "hasAllWheelDrive", use: "drives all four wheels when it's slippery" },
                        { id: "winterReadyTyres", use: "grip when the road is cold and wet" },
                        { id: "hasHeatedSeats", use: "warm you before the cabin does" },
                        { id: "hasCorneringLights", use: "light the bend on a dark road" },
                    ],
                    notInData: null,
                    status: "active",
                },
                {
                    id: "lane-changes",
                    label: "Changing lanes without worry",
                    importance: "essential",
                    said: "changing lanes is what makes you least confident",
                    priorities: ["safetyAssistance"],
                    evidence: [
                        { id: "hasBlindSpotAssist", use: "warns you about a car in the next lane" },
                        { id: "hasLaneKeepingAssist", use: "keeps you centred while you look" },
                    ],
                    notInData: null,
                    status: "active",
                },
                {
                    id: "not-cramped",
                    label: "Not cramped with four aboard",
                    importance: "important",
                    said: "your sister and her two children travel with you",
                    priorities: ["practicality"],
                    evidence: [
                        { id: "seatsFivePlus", use: "seats all of you" },
                        { id: "rearDoors", use: "get the children in and out" },
                        { id: "bootVolume", use: "takes everyone's bags on a trip" },
                    ],
                    notInData: "how much rear legroom there is",
                    status: "active",
                },
            ],
            notModelled: [{ said: "anything luxurious", stance: "doesntCare", explanation: "Lens has no measure of luxury." }],
        },
    },
];
