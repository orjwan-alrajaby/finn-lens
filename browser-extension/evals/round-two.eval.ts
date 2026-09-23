import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it } from "vitest";

import { converseWith } from "./harness";

/*
 * Ten harder situations, from the second round of stress-testing. Not
 * assertions: transcripts, written to evals/out/, to be read.
 *
 *   npx vitest run --config vitest.eval.config.ts
 *   ONLY=4,10 npx vitest run --config vitest.eval.config.ts
 */

export const ROUND_TWO: { id: string; messages: string[]; answers?: string[]; afterCompare?: string[] }[] = [
    {
        id: "01-dont-know",
        messages: [
            "I'm getting a car because my current one is becoming a pain and I honestly don't know enough about cars to know what I should be looking for. It's mostly just me driving to work, about 40 minutes each way, but every couple of weekends I drive to see my parents and that's around 200 km. Sometimes my girlfriend comes with me and we bring a lot of stuff for the weekend. I hate parking though, especially parallel parking, and I really don't want one of those enormous cars. I'd like to spend somewhere around 450 a month, definitely not 600. I guess safety matters too but I don't really know what safety features are actually useful.",
        ],
    },
    {
        id: "02-three-kids-no-seven-seater",
        messages: [
            "I need something for two adults and three kids, but please don't give me a massive seven seater just because I said three kids. They're 8, 11 and 14 and they're all pretty independent. We do school runs during the week and maybe one longer trip every month. On those trips we usually have quite a bit of luggage. I care more about the car being comfortable and easy to drive than having every possible family feature. Around 650 euros a month is okay but I'd rather be closer to 550.",
        ],
    },
    {
        id: "03-night-drives",
        messages: [
            "My husband works nights so sometimes I'm driving home with the kids at like 11pm and I really don't enjoy it. It's not that I'm a bad driver, I just hate poorly lit roads and cars appearing out of nowhere beside me. During the day I mostly drive around town doing errands. We have two children, 5 and 9, and usually a stroller isn't involved anymore but somehow the boot is always full anyway. I don't care about acceleration or having a pretty car. I just want something that makes those drives feel less stressful. We can do 600 a month.",
        ],
    },
    {
        id: "04-changes-mind",
        messages: [
            "I mostly need something for commuting. It's about 70 km a day, mostly motorway. I live alone so I don't need much space. I'd like something efficient and comfortable, probably around 500 euros a month.",
            "Actually, I forgot something important. My mother has mobility problems and I drive her to medical appointments a couple of times a month. Getting in and out of the car can be difficult for her, so that's more important than having a tiny car now.",
            "And actually don't increase the budget for that. 500 is still the absolute maximum.",
        ],
    },
    {
        id: "05-ev-no-lecture",
        messages: [
            "I want an electric car because I like the idea of driving electric, but please don't give me a lecture about whether it's environmentally better. That's not why I'm buying one. I drive maybe 30 km most days and can charge at home. Once or twice a month I do a 300 km trip to visit family. I have two dogs, so I need enough usable space for them and some bags, but I don't need a giant SUV. I'd like to keep it under 550 euros.",
        ],
    },
    {
        id: "06-little-ones",
        messages: [
            "I'm getting a car for me and my two little ones. They're both still young enough that getting them into the car is a whole production every morning. I also carry a buggy and quite a lot of shopping. Most of our driving is short city trips but we go to my parents about once a month, around two hours away. I'd really like something with the kind of safety stuff that helps when you're distracted by children in the back. Budget is 500 a month, absolute maximum.",
        ],
    },
    {
        id: "07-tight-money",
        messages: [
            "Money is a bit tight so I need to be strict about this. I can pay 400 euros a month, and maybe 425 if that's genuinely the difference between something workable and something I shouldn't get. I drive about 20 km a day, mostly in the city. Once every few months I take a long trip with my partner. I have back problems so a comfortable driving position matters a lot, and I absolutely hate cars where I feel like I can't see what's around me. I don't care about fancy screens or performance. I'd rather have something boring that is easy to live with.",
        ],
    },
    {
        id: "08-charging-in-the-back",
        messages: [
            "My kids are constantly fighting over who's phone is dying first on long drives, so something in the back where they can actually plug their stuff in would save my sanity. I don't need some fancy built-in entertainment system because they'll use their own tablets anyway. We also take quite a lot of luggage when we visit family. They're 6 and 9. Safety is obviously important too but I don't need the car to drive for me.",
        ],
        afterCompare: ["Does this one actually have somewhere in the back for them to charge their tablets?"],
    },
    {
        id: "09-moving-to-town",
        messages: [
            "I'm moving from the city to a small town, so I'll probably be driving more than I do now. At the moment I walk everywhere and barely use a car. My new job will be about 60 km away though, and I'll probably be doing that commute four days a week. I also want to visit friends in the city on weekends. I'm single and don't have children. I don't really care about having lots of boot space. I mentioned the move because I don't know if that changes what kind of car makes sense.",
        ],
    },
    {
        id: "10-asking-too-much",
        messages: [
            "Okay so I need your help because I'm probably asking for too much. I want something small enough that I don't hate driving it around the city, but comfortable enough for four or five hour trips. I have two kids, 4 and 6, and we take their bikes with us sometimes, although not always. I get anxious changing lanes and parking but I'm actually pretty good on normal roads. My partner really wants an electric car because we can charge at home, while I'm worried about getting stranded on longer trips. We sometimes go away in winter too. I don't care about luxury, acceleration or having a huge screen. I'd like to stay under 600 a month and I really don't want you to just tell me the most expensive car that technically does everything. If there isn't a car that fits all of this, tell me what I'd actually be giving up.",
        ],
        answers: ["Either is fine — I'd rather see what we'd give up"],
        afterCompare: ["So what would we actually be giving up if we went electric?"],
    },
];

const only = process.env.ONLY?.split(",").map((value) => value.padStart(2, "0"));
const out = join(import.meta.dirname, process.env.REPLAY ? "replayed" : process.env.LENS_EVAL_MOCK === "1" ? "mocked" : "out");

describe.concurrent("round two", () => {
    for (const scenario of ROUND_TWO) {
        if (only && !only.some((prefix) => scenario.id.startsWith(prefix))) continue;

        it(scenario.id, async () => {
            /* REPLAY=dir plays back a run's recorded model replies through the current code. */
            const recorded = process.env.REPLAY ? join(process.env.REPLAY, `${scenario.id}.json`) : null;
            const replay = recorded && existsSync(recorded) ? JSON.parse(readFileSync(recorded, "utf8")) : null;

            if (process.env.REPLAY && !replay) return;

            const conversation = await converseWith(scenario.messages, { afterCompare: scenario.afterCompare, answers: scenario.answers, replay });

            mkdirSync(out, { recursive: true });
            writeFileSync(join(out, `${scenario.id}.txt`), conversation.report);
            writeFileSync(join(out, `${scenario.id}.json`), JSON.stringify(conversation.turns.map((turn) => turn.raw), null, 2));
        });
    }
});
