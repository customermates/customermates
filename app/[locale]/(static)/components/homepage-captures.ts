import type { AssetLocale } from "@/i18n/locale-registry";

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
    de: { height: 454, width: 1544 },
    en: { height: 454, width: 1582 },
  },
  "homepage-usecase-draft": {
    de: { height: 588, width: 1000 },
    en: { height: 592, width: 1000 },
  },
  "homepage-usecase-connect": {
    de: { height: 1168, width: 1040 },
    en: { height: 1168, width: 1040 },
  },
  "homepage-usecase-calendar": {
    de: { height: 656, width: 1000 },
    en: { height: 656, width: 1000 },
  },
  "homepage-usecase-contacts": {
    de: { height: 818, width: 920 },
    en: { height: 818, width: 920 },
  },
  "homepage-usecase-import": {
    de: { height: 1068, width: 960 },
    en: { height: 1068, width: 960 },
  },
  "homepage-usecase-search": {
    de: { height: 694, width: 1088 },
    en: { height: 758, width: 1088 },
  },
  "homepage-usecase-team": {
    de: { height: 1398, width: 880 },
    en: { height: 1308, width: 880 },
  },
  "homepage-usecase-playbook": {
    de: { height: 996, width: 1120 },
    en: { height: 948, width: 1120 },
  },
  "homepage-usecase-whatsapp": {
    de: { height: 846, width: 880 },
    en: { height: 800, width: 880 },
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
    de: { height: 1688, width: 1022 },
    en: { height: 1688, width: 1034 },
  },
  "homepage-configure-mobile": {
    de: { height: 1688, width: 780 },
    en: { height: 1688, width: 780 },
  },
} as const satisfies Record<string, Record<AssetLocale, CaptureSize>>;

export type HomepageCaptureName = keyof typeof HOMEPAGE_CAPTURES;
export type HomepageCaptureTheme = "dark" | "light";

export function homepageCaptureSrc(name: HomepageCaptureName, locale: AssetLocale, theme: HomepageCaptureTheme) {
  return `/captures/${theme}/${name}-${locale}.png`;
}
