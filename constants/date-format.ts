export const DATE_DISPLAY_FORMATS = [
  "numericalLong",
  "numericalShort",
  "descriptiveShort",
  "descriptiveLong",
  "relative",
] as const;

export type DateDisplayFormat = (typeof DATE_DISPLAY_FORMATS)[number];
