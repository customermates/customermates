import type { WikiCrawlRecord } from "@/ee/wiki-crawl/wiki-website-crawl.service";
import type { WikiSynthesisBriefState } from "@/ee/wiki-crawl/wiki-synthesis-brief";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { WorkspaceSetupStatus } from "./workspace-setup.schema";
import type { SetupPageKind } from "./workspace-setup-knowledge";

import { WikiSynthesisBriefSource } from "@/ee/wiki-crawl/wiki-synthesis-brief";
import { getTranslator } from "@/i18n/get-translator";
import { appLocaleOrDefault } from "@/i18n/locale-registry";

import { setupKnowledgeBrief } from "./workspace-setup-knowledge";

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
    if (setup.status === "rolledBack") return { status: "cancelled" };
    if (UNCONFIRMED.has(setup.status)) return { status: giveUp ? "none" : "wait" };
    if (!setup.plan) return { status: "none" };
    const locale = appLocaleOrDefault(crawl.locale);
    const t = await getTranslator(locale, "WikiSetup.generated");
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
      status: "ready",
      brief: setupKnowledgeBrief(setup.plan, setup.answers, (kind, competitor) =>
        kind === "competitor" ? t("setupPages.competitor", { competitor: competitor ?? "" }) : titles[kind],
      ),
    };
  }
}
