import type { WikiCrawlRecord } from "@/ee/wiki-crawl/wiki-website-crawl.service";
import type { WikiSynthesisBriefState } from "@/ee/wiki-crawl/wiki-synthesis-brief";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { WorkspaceSetupStatus } from "./workspace-setup.schema";
import type { SetupPageKind, SetupPageTitle } from "./workspace-setup-knowledge";
import type { WikiSynthesisTranslate } from "@/ee/wiki-crawl/wiki-website-synthesis.service";

import { WikiSynthesisBriefSource } from "@/ee/wiki-crawl/wiki-synthesis-brief";
import { getTranslator } from "@/i18n/get-translator";
import { appLocaleOrDefault } from "@/i18n/locale-registry";

import { setupKnowledgeBrief } from "./workspace-setup-knowledge";
import { setupLanguage } from "./workspace-setup-inputs";

export type SetupPageCopy = {
  t: WikiSynthesisTranslate;
  title: SetupPageTitle;
  operatingGuide: string;
  sourcesHeading: string;
  gapsHeading: string;
  pagesHeading: string;
  answersSource: (date: string) => string;
};

export async function setupPageTitles(locale: string): Promise<SetupPageCopy> {
  const appLocale = appLocaleOrDefault(locale);
  const t = await getTranslator(appLocale, "WikiSetup.generated");
  const titles: Record<Exclude<SetupPageKind, "competitor">, string> = {
    overview: t("roles.company_overview"),
    idealCustomer: t("roles.customers_and_use_cases"),
    salesPlaybook: t("roles.sales_messaging"),
    toneOfVoice: t("roles.voice_and_tone"),
    productsPricing: t("setupPages.productsPricing"),
    faq: t("setupPages.faq"),
    processes: t("setupPages.processes"),
  };
  return {
    t,
    operatingGuide: t("roles.operating_guide"),
    sourcesHeading: t("sourcesHeading"),
    gapsHeading: t("gapsHeading"),
    pagesHeading: t("pagesHeading"),
    answersSource: (date) => t("answersSource", { date }),
    title: (kind, competitor) =>
      kind === "competitor" ? t("setupPages.competitor", { competitor: competitor ?? "" }) : titles[kind],
  };
}

const UNCONFIRMED: ReadonlySet<WorkspaceSetupStatus> = new Set(["interview", "planning", "planned"]);

export class WorkspaceSetupKnowledgeBrief extends WikiSynthesisBriefSource {
  constructor(private repo: Pick<WorkspaceSetupRepo, "findCurrent">) {
    super();
  }

  async brief(
    crawl: Pick<WikiCrawlRecord, "id" | "payer" | "locale">,
    giveUp: boolean,
  ): Promise<WikiSynthesisBriefState> {
    if (crawl.payer !== "workspaceSetup") return { status: "none" };
    const setup = await this.repo.findCurrent();
    if (!setup) return { status: "cancelled" };
    if (setup.crawlId !== crawl.id) return { status: giveUp ? "cancelled" : "wait" };
    if (UNCONFIRMED.has(setup.status)) return { status: giveUp ? "cancelled" : "wait" };
    if (!setup.plan) return { status: "none" };
    const locale = setupLanguage(setup.answers, crawl.locale);
    const { title } = await setupPageTitles(locale);
    return {
      status: "ready",
      brief: setupKnowledgeBrief(setup.plan, setup.answers, title),
    };
  }
}
