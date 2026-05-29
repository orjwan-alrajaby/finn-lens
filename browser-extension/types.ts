// TODO: evolve Car type in a future iteration to be more intentional & sophisticated.
// Currently, this type is a raw type because it's inferred from scraped raw data.
export type CarType = {
  id: string;

  name: string;

  url: string;

  description?: string;

  thumbnail?: string;

  images?: string[];

  price?: {
    baseValue?: number | null;
    discount?: DiscountType | null;
    oldValue?: number | null;
    period?: PeriodType | null;
  };

  configs?: {
    businessCustomerConfigs?: CarConfigType[] | null;
    privateCustomerConfigs?: CarConfigType[] | null;

    tabs?: {
      businessCustomerWithoutVAT?: string;
      privateCustomerWithVAT?: string;
    };
  };

  scores?: CarScoreType[];

  strengths?: string[];

  weaknesses?: string[];

  technicalSpecTypes?: TechnicalSpecType[];

  details?: {
    design?: {
      text?: string;
      images?: string[];
    };

    equipment?: {
      text?: string;
      images?: string[];
    };

    motor?: string;

    space?: string;
  };
};

export type CarConfigType = {
  id: string;

  title?: string;

  normalizedTitle?: string;

  fuelType?: string;

  transmission?: string;

  power?: string;

  colors?: string[];

  tags?: string[];

  image?: string;

  imageCount?: number;

  monthlyPrice?: number | null;

  oldPrice?: number | null;

  discountPercentage?: number | null;

  deliveryEstimate?: string;

  rawSpecs?: string[];

  environmentalData?: {
    co2Class?: string | null;
    consumption?: number | null;
    emissions?: number | null;
  };
};

export type CarScoreType = {
  label: string;
  value: number;
};

export type TechnicalSpecType = {
  label: string;
  value: string;
};

export type CarsType = CarType[];

export type PeriodType = "month" | "week" | "year";

export type DiscountType = { percentage: string; amount: number };