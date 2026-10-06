import type {
  CategoryDef,
  FeatureImportance,
  FeatureSelection,
  LensPreferences,
  PriorityDefinition,
  Profile,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Feature importance                                                         */
/* -------------------------------------------------------------------------- */

/**
 * How much extra influence a picked-out feature carries.
 *
 * Read the numbers like this: every feature in a category's catalogue counts
 * once, because it is relevant equipment. A feature the user picked out
 * counts again for how much they said it should influence the result — once
 * more for the lowest level, twice for the middle, three times for the
 * highest. Hence 2, 3 and 4 against a base of 1.
 *
 * The ratios matter, not the absolute figures. What they have to achieve is
 * narrow: an extremely-important pick should visibly outweigh a merely
 * important one, and the whole catalogue must stay the denominator so that no
 * single feature can push a category to 0 or 100. Anything much steeper (the
 * old system's 5-to-1) starts letting five picks drown out the ten to fifteen
 * other things the category is actually made of.
 *
 * The three labels are adverbs because the question above them is "how much
 * should this influence your decision?" and an adverb is what answers it —
 * "somewhat", "moderately", "highly" finish the reader's own sentence, where
 * "high / medium / low" was a grading scheme they had to decode first. There
 * is deliberately no "essential" and no "required": nothing here gates a car
 * out, so no label may sound like it does.
 *
 * The colour fields live here rather than in the components so that the
 * scale looks the same everywhere it is shown — the picker in the compare
 * drawer, the priority editor in settings, and the chips in the advice.
 *
 * Three distinct hues, not three depths of one. Depth of colour asks the
 * reader to judge how much of a thing they are looking at, which is a
 * comparison they can only make with two swatches side by side; three hues
 * are told apart on sight, one at a time, which is how these are actually
 * read — one row at a glance in a list of fifteen.
 *
 * Emerald and orange are darker than the ones this scale shipped with, and
 * that is a contrast fix rather than a change of mind: white on the old
 * #009966 measured 3.65:1 and on #f54900 3.60:1, against the 4.5:1 that the
 * 10px labels they carry need. See assets/tailwind.css for the full set.
 */
export const FEATURE_IMPORTANCE = {
  /*
   * The keys are high/medium/low and stay that way. They are written into
   * saved settings, so renaming them to match the labels would strand every
   * preference a reader has already stored behind a migration — and the
   * labels are free to change again without touching any of that.
   */
  high: {
    label: "Highly",
    /** Completes "you said it should count ___". */
    inSentence: "highly",
    /** Names the level where the control isn't on screen to give it context. */
    badgeLabel: "Highly influential",
    /*
      * It used to read "As much as anything else in this priority", which is
      * the sentence *standard* means — a reader skimming the four levels met
      * the top one and the resting one making the same promise.
      */
    hint: "The most a single feature can count here",
    /** What the level actually does, for the badge's tooltip. */
    meaning:
      "Counts four times as much as a feature left on standard — the strongest thing you can say here. Still not a requirement: a car can miss it and still be the recommendation, with the gap named in your advice.",
    weight: 4,
    /* Rose: the loudest of the three. */
    activeClass:
      "bg-finn-influence-red text-white ring-1 ring-finn-influence-red",
    idleClass: "text-finn-influence-red hover:bg-finn-influence-red-pale",
    dotClass: "bg-finn-influence-red",
    selectedCardClass: "bg-finn-influence-red-pale",
    /** The bar down a raised row's left edge, at full strength. */
    borderClass: "border-l-finn-influence-red",
    accentTextClass: "text-finn-influence-red",
    chipClass: "bg-finn-influence-red-pale text-finn-influence-red",
  },
  medium: {
    label: "Moderately",
    inSentence: "moderately",
    badgeLabel: "Moderately influential",
    hint: "Clearly more than the rest of this priority",
    meaning:
      "Counts three times as much as a feature left on standard — clearly more than the rest of this priority, without dominating it.",
    weight: 3,
    /* Orange: the middle step, warm rather than louder blue. */
    activeClass:
      "bg-finn-influence-orange text-white ring-1 ring-finn-influence-orange",
    idleClass: "text-finn-influence-orange hover:bg-finn-influence-orange-pale",
    dotClass: "bg-finn-influence-orange",
    selectedCardClass: "bg-finn-influence-orange-pale",
    /** The bar down a raised row's left edge, at full strength. */
    borderClass: "border-l-finn-influence-orange",
    accentTextClass: "text-finn-influence-orange",
    chipClass: "bg-finn-influence-orange-pale text-finn-influence-orange",
  },
  low: {
    label: "Somewhat",
    inSentence: "somewhat",
    badgeLabel: "Somewhat influential",
    hint: "A little more than the rest of this priority",
    meaning:
      "Counts twice as much as a feature left on standard — a nudge in its favour rather than a demand.",
    weight: 2,
    /* Emerald: the calmest of the three, so visual weight tracks stated
       weight. */
    activeClass:
      "bg-finn-influence-emerald text-white ring-1 ring-finn-influence-emerald",
    idleClass:
      "text-finn-influence-emerald hover:bg-finn-influence-emerald-pale",
    dotClass: "bg-finn-influence-emerald",
    selectedCardClass: "bg-finn-influence-emerald-pale",
    /** The bar down a raised row's left edge, at full strength. */
    borderClass: "border-l-finn-influence-emerald",
    accentTextClass: "text-finn-influence-emerald",
    chipClass: "bg-finn-influence-emerald-pale text-finn-influence-emerald",
  },
} as const satisfies Record<
  FeatureImportance,
  {
    label: string;
    inSentence: string;
    badgeLabel: string;
    hint: string;
    meaning: string;
    weight: number;
    activeClass: string;
    idleClass: string;
    dotClass: string;
    selectedCardClass: string;
    borderClass: string;
    accentTextClass: string;
    chipClass: string;
  }
>;

/** Every catalogue feature counts once for being relevant equipment. */
export const BASE_FEATURE_WEIGHT = 1;

/**
 * The rung below the three, and the one every feature starts on.
 *
 * Not a fourth importance: there is no such stored value, and a feature
 * sitting here is simply one the reader hasn't singled out — weight 1, like
 * the rest of the catalogue. It exists because the interface needs a *name*
 * for that. "Nothing selected" is an absence, and an absence is what a reader
 * mistakes for "doesn't count"; "Standard" is a state they can see themselves
 * choosing, sitting in the same control as the levels above it, which makes
 * the whole model legible in one glance: everything counts as standard, and
 * you may raise five of them.
 *
 * Grey on purpose. It is the resting state, not a low grade.
 */
export const STANDARD_INFLUENCE = {
  label: "Standard",
  /*
   * It used to say "Counts like everything else in this priority", which was
   * only true while nothing was raised — and every profile raises something.
   */
  hint: "Counts once",
  /**
   * Said as a state rather than as a level, because that is what it is: not
   * a fourth strength but the absence of a claim. "Standard influence" would
   * imply the reader chose it; most of the time they simply had no opinion,
   * and the honest badge says so without suggesting anything was lost.
   */
  badgeLabel: "Standard Influence",
  meaning:
    "Counts once. Nothing here is ignored — this one just isn't carrying extra weight, and anything raised in this priority counts two to four times as much.",
  /** Stated for the reader of this file; the scorer uses BASE_FEATURE_WEIGHT. */
  weight: BASE_FEATURE_WEIGHT,
  activeClass: "bg-finn-iron/20 text-finn-black ring-1 ring-finn-iron/25",
  idleClass: "text-finn-iron hover:bg-finn-cotton hover:text-finn-black",
  dotClass: "bg-finn-iron/30",
  accentTextClass: "text-finn-iron",
} as const;

/**
 * The resting state of a niche item: not counted until raised.
 *
 * A towbar, roof rails, a sixth seat and a spare wheel matter a great deal to
 * the people who need them and not at all to everyone else. Counting them at
 * standard for every reader would mark half of FINN's cars down for lacking a
 * towbar nobody asked for, so they start here and count from the first raise.
 */
export const NICHE_INFLUENCE = {
  label: "Not counted",
  hint: "Only counts if you raise it",
  badgeLabel: "Not counted",
  meaning:
    "Most drivers don't need this, so it doesn't count unless you raise it. Raise it and it counts like any other raised item.",
  weight: 0,
  activeClass: "bg-finn-cotton text-finn-iron ring-1 ring-finn-iron/15",
  idleClass: "text-finn-iron hover:bg-finn-cotton hover:text-finn-black",
  dotClass: "bg-finn-iron/15",
  accentTextClass: "text-finn-iron",
} as const;

/**
 * The level a raise lands on when nothing chose one — a migrated flat list
 * from an older build, or a toggle with no level attached. The middle rung,
 * because picking something already says it matters and either end would put
 * words in the reader's mouth. It still counts three times a standard item.
 */
export const DEFAULT_FEATURE_IMPORTANCE: FeatureImportance = "medium";

/** The levels strongest-first, for anything reasoning about weight. */
export const IMPORTANCE_LEVELS = ["high", "medium", "low"] as const;

/**
 * The levels as the user meets them, gentlest first.
 *
 * The control reads left to right as a rising scale, which is the whole point
 * of it — reversing the internal order here keeps that reading in one place
 * instead of in every component that draws the control.
 */
export const IMPORTANCE_SCALE = ["low", "medium", "high"] as const;

/* -------------------------------------------------------------------------- */
/* Features                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Every feature FINN's data exposes, with a plain-English explanation.
 *
 * The explanations exist so a reader never has to leave Lens to look up a
 * term. Each one says what the system actually does — no marketing, no
 * "provides useful everyday assistance", and no claim the data can't support.
 *
 * `article` is set on the countable singulars, so prose reads "it doesn't
 * have a towbar" rather than "it doesn't have towbar". It is data rather than
 * a rule because no heuristic worth having can tell "a sunroof" from "privacy
 * glass" — both are single words ending in a consonant, and only one takes an
 * article. Features without it are plurals or mass nouns and need none.
 */
export const FEATURES = {
  hadLedLights: {
    label: "LED headlights",
    explanation:
      "Headlights that use LEDs instead of halogen bulbs. They throw a brighter, whiter beam and use less power.",
  },
  hasFogLights: {
    label: "Fog lights",
    explanation:
      "Extra low, wide-beam lamps at the front. They light the road edge in fog, heavy rain and snow, where normal headlights reflect back at you.",
  },
  hasMatrixLedHeadlights: {
    label: "Matrix LED headlights",
    explanation:
      "Headlights split into segments that switch off individually. You can leave main beam on and the car blanks out just the part aimed at oncoming traffic.",
  },
  hasSunroof: {
    article: "a",
    label: "Sunroof",
    explanation:
      "A glass panel in the roof. Depending on the car it either slides open or is fixed and only lets light in.",
  },
  hasTowbar: {
    article: "a",
    label: "Towbar",
    explanation:
      "A fitted tow hitch at the rear, for pulling a trailer or caravan or carrying a bike rack.",
  },
  hasPrivacyGlass: {
    label: "Privacy glass",
    explanation:
      "Darkened rear side and tailgate windows. They make it harder to see into the back of the car and cut sun glare for rear passengers.",
  },
  hasRoofRails: {
    label: "Roof rails",
    explanation:
      "Rails along the roof that crossbars bolt to, so you can fit a roof box, bike carrier or ski rack.",
  },
  hasElectricallyFoldingMirrors: {
    label: "Electrically folding mirrors",
    explanation:
      "The door mirrors fold flat at the touch of a button, or automatically when you lock the car — useful in narrow garages and tight street parking.",
  },
  hasRainSlashLightSensors: {
    label: "Rain & light sensors",
    explanation:
      "Sensors that start the wipers when the windscreen gets wet and switch the headlights on when it gets dark, without you touching either stalk.",
  },
  hasHeadlightCleaningSystem: {
    /* Plural: "it has headlight washers", never "a headlight washers". */
    label: "Headlight washers",
    explanation:
      "Small jets that spray the headlight lenses clean. Road salt and winter grime dim a headlight quickly.",
  },
  hasCorneringLights: {
    label: "Cornering lights",
    explanation:
      "An extra lamp that lights up the inside of a bend when you turn the wheel or indicate at low speed.",
  },

  hasHeatedSeats: {
    label: "Heated seats",
    explanation:
      "Heating elements in the seat cushion and backrest. They warm you directly, so you feel warm before the cabin does.",
  },
  hasSeatCooling: {
    label: "Ventilated seats",
    explanation:
      "Fans that draw air through perforations in the seat. They keep your back from sticking to the upholstery in hot weather.",
  },
  hasAirConditioning: {
    label: "Air conditioning",
    explanation:
      "Cools the cabin and pulls moisture out of the air, which is also what clears a fogged-up windscreen quickly.",
  },
  hasThreeZoneAutomaticClimateControls: {
    label: "3-zone climate control",
    explanation:
      "Driver, front passenger and the rear seats each get their own temperature setting, held automatically.",
  },
  hasLeatherSeats: {
    label: "Leather seats",
    explanation:
      "Leather upholstery rather than cloth. It wipes clean and doesn't soak up spills, but gets colder in winter and hotter in summer.",
  },
  hasElectricFrontSeatAdjustment: {
    label: "Electric front seats",
    explanation:
      "The front seats move on motors instead of levers, so you can fine-tune the position — and often store it — rather than working it out by hand.",
  },
  hasAmbientInteriorLightning: {
    label: "Ambient interior lighting",
    explanation:
      "Coloured strip lighting in the doors and dashboard, usually adjustable. It's decorative — it isn't bright enough to read by.",
  },
  hasLumbarSupport: {
    label: "Lumbar support",
    explanation:
      "An adjustable pad in the seat backrest that pushes into the curve of your lower back. It's what stops the ache on a long drive.",
  },
  hasHeatedSteeringWheel: {
    article: "a",
    label: "Heated steering wheel",
    explanation:
      "The rim of the wheel warms up, so you can drive without gloves on a cold morning.",
  },
  hasHeadUpDisplay: {
    article: "a",
    label: "Head-up display",
    explanation:
      "Projects your speed and navigation directions onto the windscreen in front of you, so you read them without looking down at the dials.",
  },

  hasAppleCarPlaySlashAndroidAuto: {
    label: "Apple CarPlay / Android Auto",
    explanation:
      "Puts your phone's maps, music and messages on the car's own screen, so you use apps you already know instead of the car's built-in ones.",
  },
  hasWirelessAppleCarPlaySlashAndroidAuto: {
    label: "Wireless CarPlay / Android Auto",
    explanation:
      "CarPlay or Android Auto without a cable: the phone connects to the car's screen by itself when you get in, so even a short trip gets your maps and music.",
  },
  hasWirelessChargingStation: {
    /* A gerund, so it takes no article: "it has wireless phone charging". */
    label: "Wireless phone charging",
    explanation:
      "A pad you rest a compatible phone on to charge it without plugging in a cable.",
  },
  hasPremiumSoundSystem: {
    article: "a",
    label: "Premium sound system",
    explanation:
      "The manufacturer's upgraded audio system — typically more speakers and a separate amplifier than the standard fit.",
  },
  hasIntegratedNavigationSystem: {
    label: "Built-in navigation",
    explanation:
      "Maps stored in the car itself, so directions keep working where there's no phone signal.",
  },

  hasAdaptiveCruiseControl: {
    label: "Adaptive cruise control",
    explanation:
      "Holds a set speed and automatically slows to keep a gap from the car in front, then picks the speed back up. Ordinary cruise control can't slow down for traffic.",
  },
  hasCruiseControl: {
    label: "Cruise control",
    explanation:
      "Holds a speed you set so you can take your foot off the accelerator. It does not react to traffic ahead — you brake yourself.",
  },
  hasIsofix: {
    label: "ISOFIX child seat anchors",
    explanation:
      "Metal anchor points built into the seat frame. A compatible child seat clicks straight onto them instead of being strapped in with the seatbelt.",
  },
  hasLaneKeepingAssist: {
    label: "Lane keeping assist",
    explanation:
      "Watches the lane markings and nudges the steering back if you start drifting out of your lane without indicating.",
  },
  hasParkingAssistant: {
    article: "a",
    label: "Parking assistant",
    explanation:
      "Finds a space and steers the car into it while you control the brake and accelerator.",
  },
  hasParkingSensors: {
    label: "Parking sensors",
    explanation:
      "Sensors in the bumpers that beep faster as you get closer to an obstacle you can't see.",
  },
  hasAuxiliaryHeater: {
    article: "an",
    label: "Auxiliary heater",
    explanation:
      "A heater that runs with the engine off, so the cabin is warm and the windows clear before you get in.",
  },
  hasBlindSpotAssist: {
    label: "Blind spot warning",
    explanation:
      "Lights up a warning in the door mirror when another vehicle is alongside you, in the area you can't see in the mirrors.",
  },
  hasRearCrosswalkWarning: {
    label: "Rear cross-traffic alert",
    explanation:
      "Warns you about cars crossing behind you as you reverse out of a parking space between two vehicles.",
  },
  hasThreeSixtyDegreesCamera: {
    article: "a",
    label: "360° camera",
    explanation:
      "Cameras around the car stitched into a bird's-eye view of the whole car and everything touching it.",
  },
  hasOneEightyDegreesReversingCamera: {
    article: "a",
    label: "Reversing camera",
    explanation:
      "A camera that shows what's directly behind the car on the screen when you select reverse.",
  },

  hasHillStartAssist: {
    label: "Hill start assist",
    explanation:
      "Holds the brakes for a moment after you lift off on a slope, so the car doesn't roll back while you move to the accelerator.",
  },
  hasTirePressureMonitoringSystem: {
    label: "Tyre pressure monitoring",
    explanation:
      "Warns you on the dashboard when a tyre loses pressure, rather than you noticing it looks flat.",
  },
  hasTrafficSignRecognition: {
    label: "Traffic sign recognition",
    explanation:
      "A camera reads speed limit and no-overtaking signs and shows the current limit on the dashboard.",
  },
  hasEmergencyBrakingAssist: {
    label: "Automatic emergency braking",
    explanation:
      "Brakes the car by itself if it detects a collision coming and you haven't reacted. It can avoid the impact entirely at low speed and reduce it at higher speed.",
  },
  hasEmergencyCallSystem: {
    article: "an",
    label: "Emergency call system (eCall)",
    explanation:
      "Calls the emergency services automatically after a serious crash and sends them your location, even if nobody in the car can speak. There's also a manual button.",
  },
  hasDriverAssistance: {
    article: "a",
    label: "Driver assistance package",
    explanation:
      "FINN lists this car as carrying a driver assistance package, but not which individual systems are in it.",
  },

  hasKeylessEntryAndStart: {
    label: "Keyless entry & start",
    explanation:
      "The car unlocks when you touch the handle with the key in your pocket, and starts on a button — you never take the key out.",
  },
  hasElectricTailgate: {
    article: "an",
    label: "Electric tailgate",
    explanation:
      "The boot lid opens and closes on a motor at the press of a button, useful when both your hands are full.",
  },
  hasSplitFoldingRearSeats: {
    label: "Split-folding rear seats",
    explanation:
      "The rear bench folds down in sections, so you can carry something long and still seat a passenger in the back.",
  },
  hasHeatPump: {
    article: "a",
    label: "Heat pump",
    explanation:
      "Heats the cabin of an electric car more efficiently than a plain electric heater, so cold weather takes less of its range. Only counted for electric cars.",
  },
  hasBackUSBPorts: {
    label: "Rear USB ports",
    explanation:
      "USB sockets for the back seats, so rear passengers can charge without a cable running from the front.",
  },
  hasFrontUSBPorts: {
    label: "Front USB ports",
    explanation: "USB sockets in the front of the cabin for charging.",
  },
  hasStartSlashStopSystem: {
    article: "a",
    label: "Start/stop system",
    explanation:
      "Switches the engine off when you stop in traffic and restarts it when you pull away, to cut fuel use and idling emissions.",
  },
  hasElectricParkingBrake: {
    article: "an",
    label: "Electric parking brake",
    explanation:
      "A switch replaces the handbrake lever. It usually holds the car automatically at a standstill and releases as you drive off.",
  },
  hasAlloyWheels: {
    label: "Alloy wheels",
    explanation:
      "Cast metal wheels instead of steel wheels with plastic covers. Mostly a cosmetic difference.",
  },
  hasAutomaticTransmission: {
    article: "an",
    label: "Automatic gearbox",
    explanation:
      "The car changes gear by itself, so there's no clutch to work in stop-and-go traffic and no stalling on a hill start. Read from the gearbox FINN lists.",
  },
  hasAllWheelDrive: {
    label: "All-wheel drive",
    explanation:
      "Power goes to all four wheels, which helps the car pull away and climb on snow, ice and wet roads. It doesn't help it stop or steer. Read from the drive type FINN lists.",
  },
  hasSpareWheel: {
    article: "a",
    label: "Spare wheel",
    explanation:
      "An actual spare wheel in the boot, rather than only a tyre repair kit — so a serious puncture doesn't need a tow.",
  },
} as const;
type FeatureId = keyof typeof FEATURES;

/* -------------------------------------------------------------------------- */
/* Derived signals                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Evidence read from FINN's structured fields rather than its equipment list.
 *
 * Each is something FINN states directly — the number of doors, the number of
 * seats, the driver assistance level it lists, the measured length — turned
 * into the same yes-or-no or 0-to-1 reading an equipment entry gives. None is
 * inferred from an unrelated field.
 *
 * `bootVolume` is defined but not scored: FINN's single boot figure is
 * sometimes the seats-up volume and sometimes the seats-folded one, without
 * saying which. See `BOOT_SCORING_ENABLED` in `evidence.ts`.
 */
export const DERIVED_SIGNALS = {
  rearDoors: {
    label: "Rear doors",
    explanation:
      "Doors for the back seats, so passengers and child seats go in without folding a front seat out of the way. Read from the number of doors FINN lists.",
  },
  seatsFivePlus: {
    label: "Five or more seats",
    explanation:
      "Room for at least five people. Read from the seat count FINN lists — a few small cars and coupés seat only four.",
  },
  seatsSixPlus: {
    label: "Six or more seats",
    explanation:
      "Room for more than five people, usually with a third row. Read from the seat count FINN lists, and only counted if you raise it.",
  },
  driverAssistLevel2: {
    label: "Level 2 driver assistance",
    explanation:
      "FINN lists this car's assistance as level 2: it can keep its speed, its distance and its lane together while you supervise. Level 1 manages one of those at a time.",
  },
  compactLength: {
    label: "Compact length",
    explanation:
      "How long the car is, from FINN's measured length. A shorter car fits more parking spaces and garages. It isn't a measure of how the car handles.",
  },
  compactWidth: {
    label: "Narrow width",
    explanation:
      "How wide the car is, from FINN's measured width. A narrower car fits tighter garages and parking bays and leaves more room to open the doors. FINN doesn't say whether the figure includes the mirrors.",
  },
  towingCapacity1500: {
    label: "Tows 1,500 kg or more",
    explanation:
      "The car is rated to pull a braked trailer of at least 1,500 kg, enough for most small caravans. Read from FINN's towing figure, and only counted if you raise it.",
  },
  bootVolume: {
    label: "Boot space (seats up)",
    explanation:
      "How much the boot holds with the rear seats in place, in litres.",
  },
} as const;

/** Every piece of evidence Lens can name: equipment entries and derived signals. */
export const SIGNALS = { ...FEATURES, ...DERIVED_SIGNALS } as const;

type SignalId = keyof typeof SIGNALS;

/* -------------------------------------------------------------------------- */
/* Categories                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The seven priorities, and exactly what each one scores.
 *
 * Every list here was checked against FINN's own inventory (728 cars, 152
 * models, September 2026) rather than chosen for sounding relevant:
 *
 * - `features` — the evidence the priority scores, and whose home it is. Only
 *   here can the reader raise it.
 * - `niche` — scored only once raised. A towbar is on half of FINN's cars;
 *   counting it for everyone would cost half the fleet points for something
 *   most drivers never use.
 * - `alsoCounts` — evidence whose home is elsewhere, counted here at standard
 *   for a genuinely different reason. There is one in the whole model: matrix
 *   LED headlights, home in Safety, also easing night motorway driving.
 * - `expected` — equipment nearly every FINN car lists (eCall, at 79%, with
 *   the rest because the law requires it on most models). Having it earns
 *   nothing, since it would earn the same for every car and only squeeze the
 *   differences between them; a car FINN confirms is missing one loses what
 *   missing any Standard item here costs. Raisable, like any other item. Not
 *   explained to the reader: it is arithmetic, not a rule they need.
 * - `limit`, `chargeLimit` — figures that can only reduce the priority. Electric
 *   range and DC charging time, under Long Distance, are the only ones.
 */
export const CATEGORIES = {
  safetyAssistance: {
    label: "Safety & Driver Assistance",
    icon: "shield",
    color: "#2563EB",
    question:
      "How much does the car actively do to help you avoid a collision, beyond what nearly every car has?",
    description:
      "The assistance that helps you avoid a collision: blind spot warning, rear cross-traffic alert and matrix LED headlights, plus the everyday systems like emergency braking and lane keeping. None of this is crash protection, which isn't in FINN's data.",
    recommendedFor: [
      "New or nervous drivers",
      "Motorway commuters",
      "Anyone often driving at night or in heavy traffic",
    ],
    numericOnly: false,
    features: [
      "hasBlindSpotAssist",
      "hasRearCrosswalkWarning",
      "hasMatrixLedHeadlights",
    ],
    expected: [
      "hasEmergencyBrakingAssist",
      "hasLaneKeepingAssist",
      "hasTrafficSignRecognition",
      "hasEmergencyCallSystem",
      "hasTirePressureMonitoringSystem",
    ],
  },

  cityParking: {
    label: "City & Parking",
    icon: "parking",
    color: "#0D9488",
    question: "How easy is this car to park and fit into town life?",
    description:
      "How long and wide the car is, and the cameras that help you place it. A smaller car fits more spaces; cameras help when it doesn't. An automatic gearbox is expected, for stop-and-go traffic. This isn't a verdict on how the car handles.",
    measured:
      "The car's length and width, each placed on a fixed scale: the smaller the car, the more of the scale it earns, whatever else is being compared",
    recommendedFor: [
      "City driving and street parking",
      "Tight garages and multi-storey car parks",
      "Anyone who finds parking stressful",
    ],
    numericOnly: false,
    features: [
      "compactLength",
      "compactWidth",
      "hasOneEightyDegreesReversingCamera",
      "hasThreeSixtyDegreesCamera",
    ],
    expected: [
      "hasParkingSensors",
      "hasParkingAssistant",
      "hasElectricallyFoldingMirrors",
      "hasAutomaticTransmission",
    ],
  },

  practicality: {
    label: "Practicality",
    icon: "backpack",
    color: "#0891B2",
    question:
      "Can you get people and things in and out, and carry what you need?",
    description:
      "Doors for the back seats, a fifth seat, a rear bench that folds, a tailgate that opens itself — and, if you raise them, a towbar, a towing rating of 1,500 kg, roof rails or room for six or more. Boot space isn't scored yet: FINN's figure sometimes means seats up and sometimes seats folded, and doesn't say which.",
    recommendedFor: [
      "Families with children in car seats",
      "People carrying sports, work or holiday kit",
      "Anyone who tows or uses a roof box",
    ],
    numericOnly: false,
    features: [
      "rearDoors",
      "seatsFivePlus",
      "hasSplitFoldingRearSeats",
      "hasElectricTailgate",
      "hasTowbar",
      "towingCapacity1500",
      "hasRoofRails",
      "seatsSixPlus",
    ],
    niche: ["hasTowbar", "towingCapacity1500", "hasRoofRails", "seatsSixPlus"],
    expected: ["hasIsofix"],
  },

  longDistance: {
    label: "Long Distance Travel",
    icon: "road",
    color: "#D97706",
    question: "Would this be a good tool for regular long drives?",
    description:
      "What takes the work out of hours on the motorway: level 2 driver assistance, lumbar support, a head-up display and matrix LED headlights. For an electric car a short range or slow DC charging limits the result, and a long range or fast charging doesn't raise it.",
    measured:
      "Electric range and DC charging time, for electric cars only: a range below 480 km, or a 10–80% charge slower than 30 minutes, limits how well the car can do here, and beyond those they make no difference",
    recommendedFor: [
      "Regular long-distance drivers",
      "Motorway commuters",
      "People who drive for work",
    ],
    numericOnly: false,
    features: [
      "driverAssistLevel2",
      "hasLumbarSupport",
      "hasHeadUpDisplay",
      "hasSpareWheel",
    ],
    niche: ["hasSpareWheel"],
    alsoCounts: ["hasMatrixLedHeadlights"],
    limit: "evRange",
    chargeLimit: "dcCharge",
    expected: [
      "hasCruiseControl",
      "hasAdaptiveCruiseControl",
      "hasIntegratedNavigationSystem",
    ],
  },

  climateSuitability: {
    label: "Climate Suitability",
    icon: "snowflake",
    color: "#0284C7",
    question:
      "Will you stay comfortable and see clearly in cold, heat and bad weather?",
    description:
      "Equipment that only matters when the weather does: warming the car and you on a frozen morning, cooling you in August, keeping your view clear in fog, rain and snow — and, if you raise it, all-wheel drive for pulling away on snow and ice. For an electric car, a heat pump counts too. Beyond all-wheel drive, how the car drives in bad weather isn't in FINN's data.",
    recommendedFor: [
      "Winters cold enough to scrape the windscreen",
      "Summers spent in traffic with no shade",
      "Regular driving in fog, rain or snow",
    ],
    numericOnly: false,
    features: [
      "hasHeatedSeats",
      "hasRainSlashLightSensors",
      "hasHeatedSteeringWheel",
      "hasCorneringLights",
      "hasSeatCooling",
      "hasFogLights",
      "hasAuxiliaryHeater",
      "hasHeadlightCleaningSystem",
      "hasHeatPump",
      "hasAllWheelDrive",
    ],
    niche: ["hasAllWheelDrive"],
    expected: ["hasAirConditioning"],
  },

  environmental: {
    label: "Environmental Impact",
    icon: "leaf",
    color: "#16A34A",
    question: "How much CO₂ does this car emit per kilometre?",
    description:
      "Based on the car's own reported CO₂ figure — grams per kilometre, placed on the A-to-G scale German listings use. It covers what the car emits while it's driven, not the whole environmental story of the vehicle.",
    recommendedFor: [
      "Drivers who want emissions to lead the decision",
      "Anyone weighing electric against petrol or diesel",
    ],
    numericOnly: true,
    features: [],
  },

  /*
   * How little of its own kind of energy the car uses, against others of its
   * kind — a petrol car with petrol cars, an electric car with electric cars.
   * Not emissions, which is its own priority: a frugal petrol car is
   * efficient and still emits, and a reader can care about one without the
   * other. Not running cost either, which is already in every car's price.
   */
  efficiency: {
    label: "Efficiency",
    icon: "fuel",
    color: "#CA8A04",
    question: "How little fuel or electricity does this car use for its kind?",
    description:
      "Based on the car's own reported consumption — litres or kWh per 100 km — against FINN Lens's benchmark for cars that run on the same thing. A plug-in hybrid isn't judged: FINN's one figure for it mixes fuel and electricity.",
    recommendedFor: [
      "Drivers who want a car that's frugal for its kind",
      "Anyone who drives far enough for consumption to add up",
    ],
    numericOnly: true,
    features: [],
  },

  comfort: {
    label: "Comfort",
    icon: "sofa",
    color: "#DB2777",
    question: "How pleasant is it to sit in and use on an ordinary day?",
    description:
      "The things you notice on an ordinary drive: seats you can adjust at the touch of a button, climate each passenger can set, keyless entry, a glass roof, USB ports for the back seats, and the phone and sound kit you use on every trip. It's the equipment FINN lists — how the car actually rides isn't in the data.",
    recommendedFor: [
      "Drivers who spend long stretches in the car",
      "Anyone who shares the car with passengers",
      "People coming from a sparsely equipped car",
    ],
    numericOnly: false,
    features: [
      "hasWirelessChargingStation",
      "hasKeylessEntryAndStart",
      "hasPremiumSoundSystem",
      "hasThreeZoneAutomaticClimateControls",
      "hasElectricFrontSeatAdjustment",
      "hasWirelessAppleCarPlaySlashAndroidAuto",
      "hasSunroof",
      "hasBackUSBPorts",
    ],
    expected: ["hasAppleCarPlaySlashAndroidAuto"],
  },
} satisfies Record<
  string,
  Omit<CategoryDef, "id"> & {
    numericOnly: boolean;
    features: SignalId[];
    niche?: SignalId[];
    alsoCounts?: SignalId[];
    expected?: FeatureId[];
    chargeLimit?: "dcCharge";
  }
>;

type CategoryId = keyof typeof CATEGORIES;

/* -------------------------------------------------------------------------- */
/* Feature selection rules                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The most items a reader may raise within one priority.
 *
 * A cap on how many things they can single out, not a quota to fill.
 */
export const MAX_FEATURES_PER_CATEGORY = 5;

/* -------------------------------------------------------------------------- */
/* Profiles                                                                   */
/* -------------------------------------------------------------------------- */

const emphasis = (
  entries: [SignalId, FeatureImportance][],
): FeatureSelection =>
  entries.map(([key, importance]) => ({ key, importance, source: "profile" }));

/**
 * Profiles are strong starting points, not permanent modes.
 *
 * Each carries a priority order, the evidence it starts emphasised, what it
 * promises and what it doesn't. Applying one replaces the reader's order and
 * emphasis — with an undo — and from then on everything is theirs to change;
 * the settings remember which profile they started from so the page can say
 * "Customised from Nervous Driver".
 *
 * A profile that promises one dominant concern — Nervous Driver, Eco-Conscious
 * — carries exactly three priorities, so its first one is half the result.
 * That is the whole of their protection: tested against FINN's inventory it
 * keeps the promise in over 99% of comparable sets, and no guardrail on top of
 * the weighting is needed.
 */
export const PROFILES = {
  nervous: {
    label: "Nervous Driver",
    icon: "shield",
    forWhom:
      "Drivers who want the car watching the road with them, easy to park, and helping them see in bad weather.",
    assumes:
      "Assistance that helps you avoid a collision leads, with parking and bad-weather visibility behind it.",
    doesNotGuarantee:
      "Crash protection, which isn't in FINN's data, or that no car being compared is safer in every respect.",
    priorities: ["safetyAssistance", "cityParking", "climateSuitability"],
    emphasis: {
      safetyAssistance: emphasis([
        ["hasBlindSpotAssist", "high"],
        ["hasRearCrosswalkWarning", "high"],
        ["hasMatrixLedHeadlights", "low"],
      ]),
      cityParking: emphasis([
        ["compactLength", "high"],
        ["hasOneEightyDegreesReversingCamera", "low"],
        ["hasThreeSixtyDegreesCamera", "low"],
      ]),
      climateSuitability: emphasis([
        ["hasRainSlashLightSensors", "medium"],
        ["hasFogLights", "low"],
        ["hasHeadlightCleaningSystem", "low"],
        ["hasCorneringLights", "low"],
      ]),
    },
  },

  commuter: {
    label: "City Commuter",
    icon: "compass",
    forWhom:
      "People doing the same short, busy journey most days, mostly in town.",
    assumes:
      "A car that's easy to park and pleasant in traffic leads, with safety assistance and emissions behind it.",
    doesNotGuarantee:
      "The lowest running cost, low-emission-zone access, or the smallest car being compared.",
    priorities: [
      "cityParking",
      "comfort",
      "safetyAssistance",
      "environmental",
    ],
    emphasis: {
      cityParking: emphasis([
        ["compactLength", "high"],
        ["hasOneEightyDegreesReversingCamera", "low"],
        ["hasThreeSixtyDegreesCamera", "low"],
      ]),
      comfort: emphasis([
        ["hasKeylessEntryAndStart", "medium"],
        ["hasWirelessChargingStation", "low"],
      ]),
      safetyAssistance: emphasis([
        ["hasBlindSpotAssist", "high"],
        ["hasRearCrosswalkWarning", "medium"],
      ]),
    },
  },

  family: {
    label: "Family First",
    icon: "users",
    forWhom:
      "Parents moving children, car seats and everything that comes with them, week after week.",
    assumes:
      "Getting people and kit in and out leads, with safety assistance, parking and rear-seat comfort behind it.",
    doesNotGuarantee:
      "Rear legroom, room for three car seats across, or crash protection — none of which is in FINN's data. This is a preference, not a complete family-car model.",
    priorities: ["practicality", "safetyAssistance", "cityParking", "comfort"],
    emphasis: {
      practicality: emphasis([
        ["rearDoors", "high"],
        ["hasSplitFoldingRearSeats", "high"],
        ["hasElectricTailgate", "medium"],
      ]),
      safetyAssistance: emphasis([
        ["hasBlindSpotAssist", "high"],
        ["hasRearCrosswalkWarning", "high"],
      ]),
      cityParking: emphasis([
        ["compactLength", "high"],
        ["hasOneEightyDegreesReversingCamera", "low"],
        ["hasThreeSixtyDegreesCamera", "low"],
      ]),
      comfort: emphasis([
        ["hasThreeZoneAutomaticClimateControls", "medium"],
        ["hasKeylessEntryAndStart", "low"],
      ]),
    },
  },

  roadtrip: {
    label: "Road Tripper",
    icon: "road",
    forWhom:
      "Anyone who regularly spends hours at a stretch behind the wheel.",
    assumes:
      "How little a long drive wears you out leads, then everyday comfort, with safety, carrying and weather behind.",
    doesNotGuarantee:
      "Real-world winter range, which isn't in FINN's data, or charging speed for an electric car FINN lists no DC charging time for.",
    priorities: [
      "longDistance",
      "comfort",
      "safetyAssistance",
      "practicality",
      "climateSuitability",
    ],
    emphasis: {
      longDistance: emphasis([
        ["driverAssistLevel2", "high"],
        ["hasLumbarSupport", "medium"],
        ["hasHeadUpDisplay", "low"],
      ]),
      comfort: emphasis([
        ["hasElectricFrontSeatAdjustment", "medium"],
        ["hasPremiumSoundSystem", "low"],
      ]),
      safetyAssistance: emphasis([
        ["hasBlindSpotAssist", "medium"],
        ["hasRearCrosswalkWarning", "low"],
      ]),
      practicality: emphasis([
        ["hasRoofRails", "low"],
        ["hasSplitFoldingRearSeats", "low"],
      ]),
      climateSuitability: emphasis([
        ["hasHeatedSeats", "low"],
        ["hasRainSlashLightSensors", "low"],
      ]),
    },
  },

  eco: {
    label: "Eco-Conscious",
    icon: "leaf",
    forWhom:
      "Drivers who want emissions to be the first thing the choice answers to.",
    assumes: "Tailpipe CO₂ leads, with safety assistance and practicality behind it.",
    doesNotGuarantee:
      "The car's full lifecycle footprint, the lowest running cost, or where your electricity comes from.",
    priorities: ["environmental", "safetyAssistance", "practicality"],
    emphasis: {
      safetyAssistance: emphasis([
        ["hasBlindSpotAssist", "high"],
        ["hasRearCrosswalkWarning", "medium"],
      ]),
      practicality: emphasis([
        ["rearDoors", "medium"],
        ["hasSplitFoldingRearSeats", "low"],
      ]),
    },
  },

  balanced: {
    label: "Balanced",
    icon: "scale",
    forWhom:
      "Anyone without one dominant requirement who wants a sensible all-rounder.",
    /*
     * The weighting is the same falling scale every profile gets. What is
     * balanced is the choice of five and the light emphasis, not the maths.
     */
    assumes:
      "Five everyday concerns in a sensible order, with only light emphasis inside each.",
    doesNotGuarantee:
      "That every priority counts equally — the order still decides how much each one counts.",
    priorities: [
      "safetyAssistance",
      "practicality",
      "comfort",
      "cityParking",
      "environmental",
    ],
    emphasis: {
      safetyAssistance: emphasis([["hasBlindSpotAssist", "medium"]]),
      practicality: emphasis([["hasSplitFoldingRearSeats", "low"]]),
      cityParking: emphasis([["compactLength", "medium"]]),
    },
  },
} satisfies Record<
  string,
  {
    label: string;
    icon: string;
    forWhom: string;
    assumes: string;
    doesNotGuarantee: string;
    priorities: CategoryId[];
    emphasis: Partial<Record<CategoryId, FeatureSelection>>;
  }
>;

export type ProfileId = keyof typeof PROFILES;

/**
 * How many priorities a reader's own order may hold.
 *
 * Below three there isn't enough to separate cars on: the weighting gives the
 * first priority half the result. Above five each one is worth so little that
 * the ones at the bottom stop changing any answer.
 */
export const MIN_PRIORITIES = 3;
export const MAX_PRIORITIES = 5;

/* -------------------------------------------------------------------------- */
/* Derived defaults                                                           */
/* -------------------------------------------------------------------------- */

export const CATEGORY_IDS = Object.keys(CATEGORIES) as CategoryId[];

export const NUMERIC_ONLY_CATEGORIES = CATEGORY_IDS.filter(
  (id) => CATEGORIES[id].numericOnly
);

/**
 * Every item a category can be raised on, in relevance order — its home
 * evidence, niche items included.
 */
export const AVAILABLE_CATEGORY_FEATURES = Object.fromEntries(
  CATEGORY_IDS.map((id) => [id, [...CATEGORIES[id].features] as SignalId[]])
) as Record<CategoryId, SignalId[]>;

/**
 * Which profile is automatically selected out of the box.
 *
 * "Default" means selected, not merely present.
 */
export const DEFAULT_DEFAULT_PROFILE_ID: ProfileId = "balanced";

/** Every category's emphasis under one profile, empty where it sets none. */
export function profileEmphasis(
  id: ProfileId,
): Record<CategoryId, FeatureSelection> {
  const set: Partial<Record<CategoryId, FeatureSelection>> = PROFILES[id].emphasis;

  return Object.fromEntries(
    CATEGORY_IDS.map((category) => [
      category,
      (set[category] ?? []).map((preference) => ({ ...preference })),
    ]),
  ) as Record<CategoryId, FeatureSelection>;
}

/**
 * What a fresh install starts with raised: the default profile's emphasis,
 * marked as the profile's so nothing calls it the reader's own.
 */
export const DEFAULT_CATEGORY_FEATURES: Record<CategoryId, FeatureSelection> =
  profileEmphasis(DEFAULT_DEFAULT_PROFILE_ID);

export const DEFAULT_PRIORITY_DEFINITIONS: PriorityDefinition[] =
  CATEGORY_IDS.map((id) => ({
    id,
    label: CATEGORIES[id].label,
    icon: CATEGORIES[id].icon,
    description: CATEGORIES[id].description,
    isCustom: false,
    enabled: true,
  }));

export const DEFAULT_PROFILES: Profile[] = (
  Object.keys(PROFILES) as ProfileId[]
).map((id) => ({
  id,
  label: PROFILES[id].label,
  icon: PROFILES[id].icon,
  forWhom: PROFILES[id].forWhom,
  assumes: PROFILES[id].assumes,
  doesNotGuarantee: PROFILES[id].doesNotGuarantee,
  priorities: [...PROFILES[id].priorities],
  enabled: true,
}));

/**
 * The starting priority order: the default profile's own, so that opening
 * Lens and pressing nothing gives exactly what the default profile promises.
 */
export const DEFAULT_PRIORITIES: CategoryId[] = [
  ...PROFILES[DEFAULT_DEFAULT_PROFILE_ID].priorities,
];

/* -------------------------------------------------------------------------- */
/* Preferences                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Kilometres FINN's base subscription currently includes each month.
 *
 * This is an assumption about the FINN offer, not a user preference, so it
 * deliberately lives outside LensPreferences. Anything driven beyond it is
 * charged at the vehicle's own `pricing.extraKmPrice`.
 */
export const FINN_INCLUDED_MONTHLY_KM = 500;

/**
 * The most electricity Lens allows a plug-in hybrid to use, for bounding what
 * FINN's data leaves out. FINN gives a plug-in hybrid one combined litres
 * figure and no electricity figure — none of the 44 it lists has one — so
 * its energy cost can't be estimated, only bounded: as if every kilometre
 * were driven on electricity, at more than any plug-in's official figure
 * (the large ones are around 25). An assumption, and said as one wherever
 * it's used.
 */
export const PLUG_IN_MAX_KWH_PER_100KM = 30;

/**
 * No budget, until the reader sets one.
 *
 * Zero is how this product has always said "no limit" — `calculateCost` reads
 * any non-positive budget as `null`, `partitionByBudget` then leaves every car
 * eligible, and no recommendation is flagged as a budget fallback. So this is
 * the existing three-state model's own way of expressing an absence, not a new
 * sentinel.
 *
 * It used to ship as 300. That was documented as a placeholder nobody should
 * read as advice, but it did not behave like one: the budget is the single
 * hard constraint in the product, FINN subscriptions plus energy plus excess
 * mileage routinely land well above it, and so a reader who never opened the
 * driving settings had their first recommendation overridden by a figure Lens
 * had invented on their behalf and then reported as *their* budget. A number
 * the user has never seen must not decide which car they are shown.
 *
 * The budget is untouched as a feature. Set one and every constraint, notice
 * and fallback works exactly as before.
 */
export const DEFAULT_MONTHLY_BUDGET = 0;

export const DEFAULT_PREFERENCES: LensPreferences = {
  monthlyKm: 1_000,
  petrolPrice: 1.75,
  dieselPrice: 1.7,
  electricityPrice: 0.32,
  monthlyBudget: DEFAULT_MONTHLY_BUDGET,
  contractType: "private",
  rentalFrom: null,
  rentalTo: null,
  automaticOnly: false,
};
