export const FUNCTION_SPACE_TYPES = [
  "BALLROOM",
  "BANQUET_HALL",
  "MEETING_ROOM",
  "BOARDROOM",
  "CONFERENCE_HALL",
  "LAWN",
  "TERRACE",
  "POOL_SIDE",
  "RESTAURANT_PRIVATE_ROOM",
  "OTHER",
] as const;

export const BANQUET_EVENT_TYPES = [
  "WEDDING",
  "RECEPTION",
  "CONFERENCE",
  "MEETING",
  "TRAINING",
  "SEMINAR",
  "WORKSHOP",
  "CORPORATE_EVENT",
  "SOCIAL_EVENT",
  "BIRTHDAY",
  "ANNIVERSARY",
  "EXHIBITION",
  "OTHER",
] as const;

export const BANQUET_SETUP_STYLES = [
  "THEATRE",
  "CLASSROOM",
  "BOARDROOM",
  "U_SHAPE",
  "BANQUET",
  "RECEPTION",
  "CABARET",
  "COCKTAIL",
  "CUSTOM",
] as const;

export const BANQUET_REQUIREMENT_CATEGORIES = [
  "FOOD_BEVERAGE",
  "AUDIO_VISUAL",
  "FURNITURE",
  "DECOR",
  "HOUSEKEEPING",
  "ENGINEERING",
  "SECURITY",
  "TRANSPORT",
  "OTHER",
] as const;

export const BANQUET_CHARGE_CATEGORIES = [
  "VENUE_RENTAL",
  "AUDIO_VISUAL",
  "FOOD_PACKAGE",
  "DECORATION",
  "EQUIPMENT",
  "MISCELLANEOUS",
] as const;

export const DEFAULT_FUNCTION_SPACE_TYPE: (typeof FUNCTION_SPACE_TYPES)[number] =
  "MEETING_ROOM";
export const DEFAULT_BANQUET_EVENT_TYPE: (typeof BANQUET_EVENT_TYPES)[number] =
  "CONFERENCE";
export const DEFAULT_BANQUET_SETUP_STYLE: (typeof BANQUET_SETUP_STYLES)[number] =
  "THEATRE";
export const DEFAULT_BANQUET_REQUIREMENT_CATEGORY: (typeof BANQUET_REQUIREMENT_CATEGORIES)[number] =
  "AUDIO_VISUAL";
export const DEFAULT_BANQUET_CHARGE_CATEGORY: (typeof BANQUET_CHARGE_CATEGORIES)[number] =
  "MISCELLANEOUS";

export const banquetLabel = (value: string) =>
  value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
