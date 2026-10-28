import type { ContentLocale } from "@/i18n/locale-registry";

import { versionedAssetSrc } from "@/core/utils/versioned-asset-src";
import versions from "./homepage-capture-versions.json";

type CaptureSize = { height: number; width: number };

export const HOMEPAGE_CAPTURES = {
  "homepage-inbox": {
    de: { height: 1800, width: 2880 },
    en: { height: 1800, width: 2880 },
  },
  "homepage-record": {
    de: { height: 1800, width: 2880 },
    en: { height: 1800, width: 2880 },
  },
  "homepage-pipeline": {
    de: { height: 1800, width: 2880 },
    en: { height: 1800, width: 2880 },
  },
  "homepage-dashboard": {
    de: { height: 1800, width: 2880 },
    en: { height: 1800, width: 2880 },
  },
  "homepage-routines": {
    de: { height: 1800, width: 2880 },
    en: { height: 1800, width: 2880 },
  },
  "homepage-configure": {
    de: { height: 1800, width: 2880 },
    en: { height: 1800, width: 2880 },
  },
  "homepage-thread-linkedin": {
    de: { height: 2500, width: 1950 },
    en: { height: 2500, width: 1950 },
  },
  "homepage-draft": {
    de: { height: 1252, width: 1588 },
    en: { height: 1208, width: 1588 },
  },
  "homepage-pipeline-board": {
    de: { height: 848, width: 2456 },
    en: { height: 932, width: 2456 },
  },
  "homepage-routines-table": {
    de: { height: 298, width: 1450 },
    en: { height: 298, width: 1386 },
  },
  "homepage-inbox-mobile": {
    de: { height: 1688, width: 780 },
    en: { height: 1688, width: 780 },
  },
  "homepage-record-mobile": {
    de: { height: 1688, width: 780 },
    en: { height: 1688, width: 780 },
  },
  "homepage-pipeline-mobile": {
    de: { height: 848, width: 720 },
    en: { height: 848, width: 720 },
  },
  "homepage-dashboard-mobile": {
    de: { height: 1688, width: 780 },
    en: { height: 1688, width: 780 },
  },
  "homepage-routines-mobile": {
    de: { height: 1688, width: 856 },
    en: { height: 1688, width: 702 },
  },
  "homepage-configure-mobile": {
    de: { height: 1688, width: 780 },
    en: { height: 1688, width: 780 },
  },
} as const satisfies Record<string, Record<ContentLocale, CaptureSize>>;

export type HomepageCaptureName = keyof typeof HOMEPAGE_CAPTURES;
export type HomepageCaptureTheme = "dark" | "light";

export function homepageCaptureSrc(name: HomepageCaptureName, locale: ContentLocale, theme: HomepageCaptureTheme) {
  return versionedAssetSrc(`/captures/${theme}/${name}-${locale}.png`, versions[name][locale][theme]);
}
