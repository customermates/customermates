import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { SETUP_PAGE_KINDS, SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type { WikiSynthesisBrief, WikiSynthesisBriefTopic } from "@/ee/wiki-crawl/wiki-synthesis-brief";
import type { WikiSynthesisRole } from "@/ee/wiki-crawl/wiki-synthesis.schema";

import { WIKI_SYNTHESIS_MAX_STORED_TOPICS } from "@/ee/wiki-crawl/wiki-synthesis.schema";
import { WITH_CUSTOMERS, conditionMet } from "@/features/workspace-setup/setup-interview";
import { getTranslator } from "@/i18n/get-translator";
import { appLocaleOrDefault } from "@/i18n/locale-registry";

export type SetupPageKind = (typeof SETUP_PAGE_KINDS)[number];
export type SetupPageTitle = (kind: SetupPageKind) => string;

export type SetupPageCopy = {
  title: SetupPageTitle;
  operatingGuide: string;
  sourcesHeading: string;
  gapsHeading: string;
  pagesHeading: string;
  guidesHeading: string;
  proceduresHeading: string;
  knowledgeHeading: string;
  listsHeading: string;
  relatedHeading: string;
  answersSource: (date: string) => string;
};

export async function setupPageTitles(locale: string): Promise<SetupPageCopy> {
  const appLocale = appLocaleOrDefault(locale);
  const t = await getTranslator(appLocale, "WikiSetup.generated");
  const titles: Record<SetupPageKind, string> = {
    overview: t("roles.company_overview"),
    idealCustomer: t("roles.customers_and_use_cases"),
    salesPlaybook: t("roles.sales_messaging"),
    toneOfVoice: t("roles.voice_and_tone"),
    productsPricing: t("setupPages.productsPricing"),
    faq: t("setupPages.faq"),
    processes: t("setupPages.processes"),
  };
  return {
    operatingGuide: t("roles.operating_guide"),
    sourcesHeading: t("sourcesHeading"),
    gapsHeading: t("gapsHeading"),
    pagesHeading: t("pagesHeading"),
    guidesHeading: t("links.guides"),
    proceduresHeading: t("links.procedures"),
    knowledgeHeading: t("links.knowledge"),
    listsHeading: t("links.lists"),
    relatedHeading: t("links.related"),
    answersSource: (date) => t("answersSource", { date }),
    title: (kind) => titles[kind],
  };
}

const ALWAYS_PAGE_KINDS = ["overview", "faq", "processes"] as const;
const CUSTOMER_PAGE_KINDS = ["productsPricing", "idealCustomer", "salesPlaybook"] as const;
const SINGLE_PAGE_KINDS: ReadonlySet<SetupPageKind> = new Set([
  "overview",
  "idealCustomer",
  "salesPlaybook",
  "faq",
  "toneOfVoice",
]);
const PAGE_ROLES: Record<SetupPageKind, WikiSynthesisRole> = {
  overview: "company_overview",
  productsPricing: "offering",
  idealCustomer: "customers_and_use_cases",
  salesPlaybook: "sales_messaging",
  faq: "faq",
  processes: "procedure",
  toneOfVoice: "voice_and_tone",
};
const MAX_KEY_LENGTH = 40;

export function setupPageKindOfRole(role: WikiSynthesisRole): SetupPageKind | null {
  const match = Object.entries(PAGE_ROLES).find(([, candidate]) => candidate === role);
  return match ? (match[0] as SetupPageKind) : null;
}

export function setupPageKinds(answers: SetupAnswers): SetupPageKind[] {
  const [overview, ...rest] = ALWAYS_PAGE_KINDS;
  return [overview, ...(conditionMet(WITH_CUSTOMERS, answers) ? CUSTOMER_PAGE_KINDS : []), ...rest];
}

export function setupKnowledgeBrief(
  plan: SetupPlan | null,
  answers: SetupAnswers,
  title: SetupPageTitle,
): WikiSynthesisBrief {
  const pages = plan?.knowledgeBase.pages ?? [];
  const chosen = setupPageKinds(answers);
  const keys = new Set<string>();
  const topics: WikiSynthesisBriefTopic[] = [];
  const push = (key: string, kind: SetupPageKind, pageTitle: string, outline: string[]) => {
    let unique = key.slice(0, MAX_KEY_LENGTH);
    for (let suffix = 2; keys.has(unique); suffix += 1) unique = `${key.slice(0, MAX_KEY_LENGTH - 3)}${suffix}`;
    keys.add(unique);
    topics.push({
      key: unique,
      role: PAGE_ROLES[kind],
      title: pageTitle,
      outline,
    });
  };
  for (const kind of [...chosen, "toneOfVoice" as const]) {
    const planned = pages.filter((page) => page.kind === kind);
    if (planned.length === 0) push(kind, kind, title(kind), []);
    for (const page of SINGLE_PAGE_KINDS.has(kind) ? planned.slice(0, 1) : planned)
      push(page.key, kind, page.title, page.sections);
  }
  return {
    topics: topics.slice(0, WIKI_SYNTHESIS_MAX_STORED_TOPICS - 1),
    extraRoles: [
      ...(chosen.includes("productsPricing") ? (["offering"] as const) : []),
      ...(chosen.includes("processes") ? (["procedure"] as const) : []),
    ],
    addressForm: null,
  };
}
