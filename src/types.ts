/** What a crawler / generator hands to the normaliser. Everything is optional and untrusted. */
export interface RawListing {
  source: string;
  sourceId: string;
  url?: string;
  title?: string;
  description?: string; // may contain HTML
  price?: number | string | null;
  area?: number | string | null;
  rooms?: number | string | null;
  floor?: number | string | null;
  totalFloors?: number | string | null;
  yearBuilt?: number | string | null;
  market?: string | null;
  city?: string | null;
  district?: string | null;
  street?: string | null;
  lat?: number | null;
  lng?: number | null;
  images?: string[];
  extras?: Record<string, unknown>;
}

/** Clean, typed record as stored in MySQL. null = unknown. */
export interface Listing {
  source: string;
  sourceId: string;
  url: string | null;
  title: string;
  description: string | null;
  summary: string | null;
  price: number | null;
  areaM2: number | null;
  pricePerM2: number | null;
  rooms: number | null;
  floor: number | null;
  totalFloors: number | null;
  yearBuilt: number | null;
  market: "primary" | "secondary" | null;
  conditionState: "to_renovate" | "good" | "excellent" | "developer_standard" | null;
  hasElevator: boolean | null;
  hasBalcony: boolean | null;
  hasParking: boolean | null;
  city: string | null;
  district: string | null;
  street: string | null;
  lat: number | null;
  lng: number | null;
  images: string[];
  qualityScore: number;
  contentHash: string;
  extraction: "rules" | "ai";
}

export interface SearchFilters {
  q?: string;
  city?: string;
  minArea?: number;
  maxArea?: number;
  minPrice?: number;
  maxPrice?: number;
  rooms?: number;
  hasElevator?: boolean;
  hasBalcony?: boolean;
  hasParking?: boolean;
  sort?: "newest" | "price_asc" | "price_desc" | "ppm_asc" | "area_desc" | "best";
  page?: number;
  pageSize?: number;
}
