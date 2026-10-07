import type { ContentLocale } from "@/i18n/locale-registry";

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
  "homepage-thread-linkedin": {
    de: { height: 1800, width: 1606 },
    en: { height: 1800, width: 1606 },
  },
  "homepage-draft": {
    de: { height: 862, width: 1606 },
    en: { height: 862, width: 1606 },
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
    de: { height: 1688, width: 780 },
    en: { height: 1688, width: 780 },
  },
  "homepage-dashboard-mobile": {
    de: { height: 1688, width: 780 },
    en: { height: 1688, width: 780 },
  },
  "homepage-routines-mobile": {
    de: { height: 1688, width: 780 },
    en: { height: 1688, width: 780 },
  },
} as const satisfies Record<string, Record<ContentLocale, CaptureSize>>;

export type HomepageCaptureName = keyof typeof HOMEPAGE_CAPTURES;
export type HomepageCaptureTheme = "dark" | "light";

export function homepageCaptureSrc(name: HomepageCaptureName, locale: ContentLocale, theme: HomepageCaptureTheme) {
  return `/captures/${theme}/${name}-${locale}.png`;
}
