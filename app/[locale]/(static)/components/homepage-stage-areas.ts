export const PRODUCT_DEMO_ANCHOR = "product-demo";

export const STAGE_OPEN_EVENT = "homepage-stage:open";

export const STAGE_AREAS = {
  "homepage-dashboard": "dashboard",
  "homepage-inbox": "inbox",
  "homepage-pipeline": "pipeline",
  "homepage-record": "customers",
  "homepage-routines": "routines",
} as const;

export type HomepageStageArea = (typeof STAGE_AREAS)[keyof typeof STAGE_AREAS];

const STAGE_AREA_VALUES: readonly string[] = Object.values(STAGE_AREAS);

export function stageAreaFromHash(hash: string): HomepageStageArea | null | undefined {
  if (hash === `#${PRODUCT_DEMO_ANCHOR}`) return null;
  if (!hash.startsWith(`#${PRODUCT_DEMO_ANCHOR}-`)) return undefined;

  const area = hash.slice(PRODUCT_DEMO_ANCHOR.length + 2);

  return STAGE_AREA_VALUES.includes(area) ? (area as HomepageStageArea) : undefined;
}
