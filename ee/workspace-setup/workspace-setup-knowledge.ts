import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { SETUP_PAGE_KINDS, SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type { WikiSynthesisBrief, WikiSynthesisBriefTopic } from "@/ee/wiki-crawl/wiki-synthesis-brief";
import type { WikiSynthesisRole } from "@/ee/wiki-crawl/wiki-synthesis.schema";

import { WIKI_SYNTHESIS_MAX_STORED_TOPICS } from "@/ee/wiki-crawl/wiki-synthesis.schema";
import { WITH_CUSTOMERS, conditionMet } from "@/features/workspace-setup/setup-interview";

export type SetupPageKind = (typeof SETUP_PAGE_KINDS)[number];
export type SetupPageTitle = (kind: SetupPageKind) => string;

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
