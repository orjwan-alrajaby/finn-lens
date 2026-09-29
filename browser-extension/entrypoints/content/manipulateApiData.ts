import type { FinnApiConfig, FinnCar, FuelType, Transmission } from "@/lib/types";
import {
  getFeature,
  extractFeatures,
  hasSuppliedEquipment,
  extractUnansweredFeatures,
  extractEquipmentText,
  extractAvailability,
  extractPricing,
  extractContract,
  extractDriveType,
  extractDriverAssistanceLevel,
  extractDcChargeMinutes,
  extractTowingCapacityKg,
  extractTyres,
} from "@/lib/helpers";
import { germanToEnglish } from "@/lib/translate";

const KW_TO_HP = 1.35962;

// TODO: find a better way of typing beside explicit type casting here.
function mapFinnConfig(config: FinnApiConfig): FinnCar {
  const fuelType = germanToEnglish[config.fuel] as FuelType;
  const isElectric = fuelType === "Electric";

  return {
    id: config.config_id,
    name: `${config.brand?.id} ${config.model}`,
    brand: config.brand?.id,
    model: config.model,
    trim: config.trim_name,
    year: config.model_year,
    engine: config.engine,
    equipmentLine: config.equipment_line ?? "",

    fuelType,
    transmission: germanToEnglish[config.gearshift] as Transmission,
    driveType: extractDriveType(config),

    power: {
      inKw: config.power,
      inHp: Math.round(config.power * KW_TO_HP),
    },

    isRefurbished: config.is_refurbished,
    vehicleType: config.cartype,
    doors: config.doors,

    availability: extractAvailability(config),
    pricing: extractPricing(config),
    contract: extractContract(config),

    consumption: {
      combined: config.consumption,
      city: config.consumption_city,
      highway: config.consumption_highway,
      unit: "L/100Km",
    },

    co2: {
      value: config.co2emission,
      class: config.co2_class,
      unit: "g/km",
    },

    electric: isElectric
      ? {
          range: config.ev_range ?? "Unknown",
          batteryCapacity: (getFeature(config, "Batteriekapazität") as number) ?? "Unknown",
          rangeUnit: "km",
          batteryUnit: "kWh",
        }
      : null,

    capacity: {
      trunk: (getFeature(config, "Kofferraumvolumen") as string) ?? "Unknown",
      trunkUnit: "L",
      seats: config.seats,
    },

    color: {
      id: germanToEnglish[config.color.id] ?? config.color?.id,
      name: config.color?.specific,
      hex: config.color?.color_hex,
    },

    images: {
      thumbnail: config.picture.url ?? null,
      gallery: config.pictures?.map((img) => img.url) ?? [],
    },

    features: extractFeatures(config),
    featuresSupplied: hasSuppliedEquipment(config),
    unansweredFeatures: extractUnansweredFeatures(config),
    equipmentText: extractEquipmentText(config),
    driverAssistanceLevel: extractDriverAssistanceLevel(config),
    dcChargeMinutes: isElectric ? extractDcChargeMinutes(config) : null,
    towingCapacityKg: extractTowingCapacityKg(config),
    tyres: extractTyres(config),

    dimensions: {
      length: config.vehicle_size.length_mm,
      width: config.vehicle_size.width_mm,
      height: config.vehicle_size.height_mm,
      unit: "mm",
    },
  };
}

export function mapFinnConfigToAll(configs: FinnApiConfig[]): Record<number, FinnCar> {
  return (
    configs?.reduce<Record<number, FinnCar>>((accumulator, config) => {
      accumulator[config.config_id] = mapFinnConfig(config);
      return accumulator;
    }, {}) ?? {}
  );
}