import { extractFeatures, extractAvailability, extractPricing } from "@/lib/helpers";

export type FinnApiConfig = {
  uid: number;
  config_id: number;

  brand: {
    id: string;
    picture: { url: string };
  };

  model: string;
  model_year: string;
  engine: string;
  equipment_line: string | null;
  trim_name: string;

  /* FINN's live API sends "Plug-In-Hybrid"; `germanToEnglish` reads every spelling. */
  fuel: "Benzin" | "Diesel" | "Elektro" | "Plug-in Hybrid" | "Plug-In-Hybrid";
  gearshift: "Automatik" | "Manuell";
  config_drive: string;

  cartype: string;
  power: number;
  seats: string;
  doors: string;

  default_downpayment_term: number;

  /** The contract lengths FINN offers for this car, in months. */
  available_terms?: number[];
  /** The term FINN shows first. */
  default_term?: number;

  /**
   * The monthly price for each term with nothing paid upfront: `b2c_12`,
   * `b2b_24`. It can also hold prices for terms the car isn't offered on, so
   * it is only ever read through `available_terms`. Its
   * `available_price_list` holds the same prices as FINN charges them now,
   * with a struck-through `b2c_12_old` beside a discounted one; on an
   * early-booking offer the top-level figure is the undiscounted one.
   */
  price?: Record<string, number | Record<string, number> | undefined>;

  downpayment_prices: {
    msrp: number;
    available_price_list: {
      b2b_6?: number;
      b2b_12?: number;
      b2c_6?: number;
      b2c_6_old?: number;
      b2c_12?: number;
      b2c_12_old?: number;
    };
    extra_km_price: number;
  };

  availability_by_term: {
    [key: string]: {
      available_from: string;
      available_to: string;
      deviation_in_weeks: number;
    };
  };

  consumption: number;
  consumption_city: number | null;
  consumption_highway: number | null;

  co2emission: number;
  co2_class: string;

  /** WLTP range in km, as FINN sends it: a string, "571". Null for cars that aren't electric. */
  ev_range?: string | number | null;

  color: {
    id: string;
    specific: string;
    color_hex: string;
  };

  picture: {
    url: string;
    type: string;
  };
  pictures: Array<{
    url: string;
    type: string;
  }>;

  closed_features_list?: Record<string, boolean | string | number>;

  /**
   * FINN's own equipment prose, in German, grouped as safety / comfort /
   * interior / exterior, and its option packages. Everything here is FINN's
   * text, not a flag Lens can score.
   */
  equipment?: Record<string, string | null> | null;
  equipment_packages?: Record<string, string | null> | null;
  downpayment_fixed_amount?: number;

  vehicle_size: {
    length_mm: number;
    width_mm: number;
    height_mm: number;
  };

  is_refurbished: boolean;
  has_hitch: "true" | "false";

  /** FINN's tyre setup: one all-season set, one winter set, or a summer and a winter set. */
  tires?: "all_season" | "winter" | "summer_winter" | null;
};


export type FuelType = "Electric" | "Diesel" | "Petrol" | "Plug-in Hybrid";

export type Transmission = "Automatic" | "Manual";

export type DriveType =
  | "Front-Wheel Drive"
  | "Rear-Wheel Drive"
  | "All-Wheel Drive"
  | "Unknown";

export type ConsumptionUnit = "L/100Km" | "kWh/100Km";


export interface FinnCar {
  id: number;

  name: string;
  brand: string;
  model: string;
  trim: string;
  year: string;
  engine: string;
  equipmentLine: string;

  /**
   * What FINN writes about this car's equipment in words, as FINN wrote it:
   * German, grouped, and full of things its own checkbox list leaves out — a
   * winter package with a heated windscreen, a driver-assistance package and
   * what's in it. Lens never scores it and never parses it; it is handed to
   * the model, which can read German, and quotes from it are checked back
   * against this text before a reader sees them.
   */
  equipmentText?: { group: string; text: string }[];

  fuelType: FuelType;
  transmission: Transmission;
  driveType: DriveType;

  power: {
    inKw: number;
    inHp: number;
  };

  isRefurbished: boolean;
  vehicleType: string;
  doors: string;

  availability: ReturnType<typeof extractAvailability>;
  pricing: ReturnType<typeof extractPricing>;

  consumption: {
    combined: number;
    city: number | null;
    highway: number | null;
    unit: ConsumptionUnit;
  };

  co2: {
    value: number;
    class: string;
    unit: "g/km";
  };

  electric: {
    range: number | "Unknown";
    batteryCapacity: number | "Unknown";
    rangeUnit: "km";
    batteryUnit: "kWh";
  } | null;

  capacity: {
    trunk: string;
    trunkUnit: "L";
    seats: string;
  };

  color: {
    id: string;
    name: string;
    hex: string;
  };

  images: {
    thumbnail: string;
    gallery: string[];
  };

  features: ReturnType<typeof extractFeatures>;

  /**
   * Whether FINN supplied an equipment list for this car at all. False only
   * when the list is absent or empty; a list of `false`s is supplied, and
   * means the car has none of it.
   *
   * Optional because cars pinned by earlier builds were stored without it;
   * those are read as supplied, since what's stored is what FINN sent.
   */
  featuresSupplied?: boolean;

  /**
   * Feature keys FINN's list left unanswered — missing, null or empty — on a
   * car it did supply a list for. Read as unknown rather than as a no.
   */
  unansweredFeatures?: string[];

  /**
   * FINN's `Fahrerassistenz` entry: level 1 or level 2 driver assistance.
   *
   * Null when FINN's list doesn't give a level. Optional because cars pinned
   * by earlier builds were stored without it, and those read as unknown too.
   */
  driverAssistanceLevel?: 1 | 2 | null;

  /**
   * DC charging time from 10 to 80%, in minutes, as FINN lists it for some
   * electric cars. Past 30 minutes it limits Long Distance; see `CHARGE_FACTOR_ANCHORS`.
   */
  dcChargeMinutes?: number | null;

  /**
   * The most the car may tow, braked, in kilograms, from FINN's
   * `Anhängerlast`. It's the car's rating, listed whether or not a towbar is
   * fitted. Null when FINN doesn't list one; optional for cars pinned by
   * earlier builds, which read as unknown.
   */
  towingCapacityKg?: number | null;

  /**
   * FINN's tyre setup. Shown as a fact, never scored: all-season, winter, and
   * a summer and a winter set are each a way to meet winter, not a ranking.
   */
  tyres?: "allSeason" | "winter" | "summerAndWinter" | null;

  dimensions: {
    length: number;
    width: number;
    height: number;
    unit: "mm";
  };

  /**
   * The contracts FINN offers for this car: each term's monthly price with
   * nothing paid upfront, and the window it can be delivered in.
   *
   * Optional because cars pinned by earlier builds were stored without it;
   * Lens reads its absence as "FINN's terms aren't known for this car".
   */
  contract?: ContractOffer;
}

export interface ContractTerm {
  /** Length in months. */
  months: number;
  /** Monthly price with no down payment, or null when FINN didn't publish one. */
  privateMonthly: number | null;
  businessMonthly: number | null;
  /** Earliest delivery FINN lists for this term, as an ISO date. */
  deliveryFrom: string | null;
  /** Latest delivery FINN currently lists for this term. */
  deliveryTo: string | null;
  /** How many weeks the earliest delivery may slip, as FINN states it. */
  deviationWeeks: number | null;
}

export interface ContractOffer {
  /** Every term on offer, shortest first. */
  terms: ContractTerm[];
  /** The term FINN shows first, when it is one of `terms`. */
  defaultMonths: number | null;
}

export interface PinnedFinnCar extends FinnCar {
  url: string;
  pinnedAt: string;
}
