import type { SolutionStageTab } from "./solution-stage-tab";
import type { HomepageStageArea } from "./homepage-stage-areas";

import { getTranslations } from "next-intl/server";

import solutionCaptureManifest from "@/core/solutions/solution-capture-manifest.json";
import solutionStageCaptures from "@/core/solutions/solution-stage-captures.json";
import { type SolutionCaptureManifest, solutionCapturePair } from "@/core/solutions/solution-captures";
import { type SolutionId, type SolutionStageTabId, findSolution } from "@/core/solutions/solution-catalog";
import {
  SOLUTION_STAGE_MAIN_CAPTURE_TAB,
  type SolutionStageCaptures,
  solutionStagePoster,
  solutionStageRoute,
} from "@/core/solutions/solution-stage";
import { env } from "@/env";
import { appLocaleOrDefault, contentLocaleOrDefault } from "@/i18n/locale-registry";

import { HOMEPAGE_CAPTURES, homepageCaptureSrc } from "./homepage-captures";
import { homepageDemoBaseUrl } from "./homepage-demo-url";
import { HomepageProductStage } from "./homepage-product-stage";

type Translate = Awaited<ReturnType<typeof getTranslations<"SolutionStage">>>;

const TAB_AREAS = {
  calendar: undefined,
  clientOverview: "customers",
  clients: "customers",
  dashboard: "dashboard",
  engagements: "pipeline",
  inbox: "inbox",
  pipeline: "pipeline",
  pitchBoard: "pipeline",
} as const satisfies Record<SolutionStageTabId, HomepageStageArea | undefined>;

function tabLabel(t: Translate, id: SolutionStageTabId): string {
  switch (id) {
    case "calendar":
      return t("tabs.calendar");
    case "clientOverview":
      return t("tabs.clientOverview");
    case "clients":
      return t("tabs.clients");
    case "dashboard":
      return t("tabs.dashboard");
    case "engagements":
      return t("tabs.engagements");
    case "inbox":
      return t("tabs.inbox");
    case "pipeline":
      return t("tabs.pipeline");
    case "pitchBoard":
      return t("tabs.pitchBoard");
  }
}

function tabCaption(t: Translate, id: SolutionStageTabId): string {
  switch (id) {
    case "calendar":
      return t("captions.calendar");
    case "clientOverview":
      return t("captions.clientOverview");
    case "clients":
      return t("captions.clients");
    case "dashboard":
      return t("captions.dashboard");
    case "engagements":
      return t("captions.engagements");
    case "inbox":
      return t("captions.inbox");
    case "pipeline":
      return t("captions.pipeline");
    case "pitchBoard":
      return t("captions.pitchBoard");
  }
}

type Props = {
  locale: string;
  solutionId: SolutionId;
};

export async function SolutionProductStage({ locale, solutionId }: Props) {
  const t = await getTranslations("SolutionStage");
  const solution = findSolution(solutionId);
  const contentLocale = contentLocaleOrDefault(locale);
  const captures = solutionStageCaptures as SolutionStageCaptures;
  const mainPair = solutionCapturePair(solutionCaptureManifest as SolutionCaptureManifest, solutionId, locale);
  const homepageSize = HOMEPAGE_CAPTURES["homepage-dashboard"][contentLocale];
  const fallbackPoster: SolutionStageTab["poster"] = mainPair
    ? { dark: mainPair.dark.main, light: mainPair.light.main }
    : {
        dark: { ...homepageSize, src: homepageCaptureSrc("homepage-dashboard", contentLocale, "dark") },
        light: { ...homepageSize, src: homepageCaptureSrc("homepage-dashboard", contentLocale, "light") },
      };

  const tabs = solution.stage.flatMap((tab): SolutionStageTab[] => {
    const demoPath = solutionStageRoute(captures.routes, solution, tab.id, locale);
    if (!demoPath) return [];
    const label = tabLabel(t, tab.id);
    const poster =
      tab.id === SOLUTION_STAGE_MAIN_CAPTURE_TAB
        ? fallbackPoster
        : (solutionStagePoster(captures, solutionId, tab.id, locale) ?? fallbackPoster);

    return [
      {
        alt: t("alt", { area: label }),
        area: TAB_AREAS[tab.id],
        caption: tabCaption(t, tab.id),
        demoPath,
        icon: tab.id,
        id: tab.id,
        kind: "solution",
        label,
        poster,
      },
    ];
  });

  return (
    <HomepageProductStage
      className="mt-8 sm:mt-10 lg:mt-12"
      demoBaseUrl={homepageDemoBaseUrl()}
      demoLocale={appLocaleOrDefault(locale)}
      embed={env.APP_MODE !== "self-hosted"}
      label={t("label")}
      live={{ prompt: t("livePrompt") }}
      locale={contentLocale}
      tabs={tabs}
    />
  );
}
