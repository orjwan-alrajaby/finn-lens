// TODO: evolve Car type in a future iteration to be more intentional & sophisticated.
// Currently, this type is a raw type because it's inferred from scraped raw data.
export type Car = {
  id: string;

  name: string;

  description?: string;

  mainImageUrl?: string;

  images?: string[];

  price?: {
    baseValue?: number | null;
    discount?: number | null;
    oldValue?: number | null;
    period?: string | null;
    textValue?: string | null;
  };

  configs?: {
    businessCustomerConfigs?: CarConfig[];
    privateCustomerConfigs?: CarConfig[];

    tabs?: {
      businessCustomerWithoutVAT?: string;
      privateCustomerWithVAT?: string;
    };
  };

  scores?: CarScore[];

  strengths?: string[];

  weaknesses?: string[];

  technicalSpecs?: TechnicalSpec[];

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

export type CarConfig = {
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

export type CarScore = {
  label: string;
  value: number;
};

export type TechnicalSpec = {
  label: string;
  value: string;
};

export type Cars = Car[];