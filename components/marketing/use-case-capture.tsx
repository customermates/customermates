import type { UseCaseItem, UseCaseVisual } from "@/core/fumadocs/schemas/use-cases";
import type { CSSProperties } from "react";

import { getImageProps } from "next/image";
import { useLocale } from "next-intl";

import {
  HOMEPAGE_CAPTURES,
  type HomepageCaptureName,
  homepageCaptureSrc,
} from "@/app/[locale]/(static)/components/homepage-captures";
import { Linkedin, Whatsapp } from "@/components/icons/channel-icon";
import { type AssetLocale, assetLocaleFor, contentLocaleOrDefault } from "@/i18n/locale-registry";

export type UseCaseChannel = "email" | "linkedin" | "whatsapp";

type MarkedChannel = Exclude<UseCaseChannel, "email">;

type Crop = {
  capture: HomepageCaptureName;
  channel?: MarkedChannel;
  width: number;
  x: number;
  y: number;
};

const DASHBOARD_NEXT_STEPS: Crop = {
  capture: "homepage-dashboard",
  width: 880,
  x: 1298,
  y: 543,
};

const PIPELINE_PROPOSALS: Crop = {
  capture: "homepage-pipeline-board",
  width: 868,
  x: 1215,
  y: 0,
};

const NEUTRAL_THREAD: Crop = {
  capture: "homepage-usecase-draft",
  width: 1000,
  x: 0,
  y: 0,
};

const LINKEDIN_DRAFT: Crop = { ...NEUTRAL_THREAD, channel: "linkedin" };

const AI_CONNECTIONS: Crop = {
  capture: "homepage-usecase-connect",
  width: 868,
  x: 40,
  y: 452,
};

const PIPELINE_BOARD: Crop = {
  capture: "homepage-pipeline",
  width: 1000,
  x: 530,
  y: 24,
};

const INBOX_THREADS: Crop = {
  capture: "homepage-inbox",
  width: 780,
  x: 522,
  y: 246,
};

function wholeCapture(capture: HomepageCaptureName, channel?: MarkedChannel): Record<AssetLocale, Crop> {
  const { de, en } = HOMEPAGE_CAPTURES[capture];

  return {
    de: { capture, channel, width: de.width, x: 0, y: 0 },
    en: { capture, channel, width: en.width, x: 0, y: 0 },
  };
}

export const CONVERSATION_CROPS: Record<UseCaseChannel, Record<AssetLocale, Crop>> = {
  email: { de: NEUTRAL_THREAD, en: NEUTRAL_THREAD },
  linkedin: { de: LINKEDIN_DRAFT, en: LINKEDIN_DRAFT },
  whatsapp: wholeCapture("homepage-usecase-whatsapp", "whatsapp"),
};

export const CAPTURED_USE_CASE_CROPS: Record<UseCaseVisual, Record<AssetLocale, Crop>> = {
  agent: { de: AI_CONNECTIONS, en: AI_CONNECTIONS },
  calendar: wholeCapture("homepage-usecase-calendar"),
  contacts: wholeCapture("homepage-usecase-contacts"),
  conversation: CONVERSATION_CROPS.linkedin,
  dashboard: { de: DASHBOARD_NEXT_STEPS, en: DASHBOARD_NEXT_STEPS },
  import: wholeCapture("homepage-usecase-import"),
  inbox: { de: INBOX_THREADS, en: INBOX_THREADS },
  pipeline: { de: PIPELINE_BOARD, en: PIPELINE_BOARD },
  playbook: wholeCapture("homepage-usecase-playbook"),
  proposal: { de: PIPELINE_PROPOSALS, en: PIPELINE_PROPOSALS },
  search: wholeCapture("homepage-usecase-search"),
  team: wholeCapture("homepage-usecase-team"),
};

const THEMES = [
  { className: "dark:hidden", theme: "light" },
  { className: "not-dark:hidden", theme: "dark" },
] as const;

const SIZES_REM = 17.4;
const SIZES_LG_VW = 21.5;
const SIZES_SM_VW = 45;
const SIZES_BASE_VW = 90;

function cropSizes(scale: number) {
  const round = (value: number) => Math.round(value * 10) / 10;

  return [
    `(min-width: 80rem) ${round(scale * SIZES_REM)}rem`,
    `(min-width: 64rem) ${round(scale * SIZES_LG_VW)}vw`,
    `(min-width: 40rem) ${round(scale * SIZES_SM_VW)}vw`,
    `${round(scale * SIZES_BASE_VW)}vw`,
  ].join(", ");
}

const CHANNEL_MARKS = { linkedin: Linkedin, whatsapp: Whatsapp } as const;

export function hasUseCaseCapture(kind: UseCaseVisual) {
  return Object.hasOwn(CAPTURED_USE_CASE_CROPS, kind);
}

export function conversationChannel({ description, href, title }: Pick<UseCaseItem, "description" | "href" | "title">) {
  const text = `${title} ${description} ${href}`.toLowerCase();

  if (text.includes("linkedin")) return "linkedin";
  if (text.includes("whatsapp")) return "whatsapp";

  return "email";
}

export function UseCaseCapture({ channel = "email", kind }: { channel?: UseCaseChannel; kind: UseCaseVisual }) {
  const locale = assetLocaleFor(contentLocaleOrDefault(useLocale()));
  const crop = (kind === "conversation" ? CONVERSATION_CROPS[channel] : CAPTURED_USE_CASE_CROPS[kind])?.[locale];

  if (!crop) return null;

  const Mark = crop.channel ? CHANNEL_MARKS[crop.channel] : null;

  const size = HOMEPAGE_CAPTURES[crop.capture][locale];
  const scale = size.width / crop.width;
  const style = {
    "--crop-fx": crop.x / crop.width,
    "--crop-fy": crop.y / crop.width,
    "--crop-scale": scale,
  } as CSSProperties;

  return (
    <div
      aria-hidden
      className="mk-usecase-crop"
      data-use-case-channel={kind === "conversation" ? channel : undefined}
      data-use-case-visual={kind}
    >
      <div className="mk-usecase-window">
        <div className="mk-usecase-bar">
          <span />

          <span />

          <span />

          {Mark ? <Mark className="ml-1.5 size-3 rounded-[3px]" size={12} /> : null}
        </div>

        <div className="mk-usecase-shot" style={style}>
          {THEMES.map(({ className, theme }) => {
            const { props } = getImageProps({
              alt: "",
              height: size.height,
              sizes: cropSizes(scale),
              src: homepageCaptureSrc(crop.capture, locale, theme),
              width: size.width,
            });

            return (
              // eslint-disable-next-line @next/next/no-img-element -- getImageProps keeps next/image optimization
              <img
                key={theme}
                {...props}
                alt=""
                className={className}
                data-use-case-capture={crop.capture}
                data-use-case-theme={theme}
                decoding="async"
                loading="lazy"
              />
            );
          })}
        </div>
      </div>

      <div className="mk-usecase-fade" />
    </div>
  );
}
