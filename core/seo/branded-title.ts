export const BRAND_NAME = "Customermates";
export const SEARCH_TITLE_LIMIT = 60;

const BRAND_SUFFIX = ` | ${BRAND_NAME}`;

export function brandedTitle(title: string): string {
  if (title.includes(BRAND_NAME)) return title;

  const branded = `${title}${BRAND_SUFFIX}`;

  return branded.length <= SEARCH_TITLE_LIMIT ? branded : title;
}
