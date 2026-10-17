import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { SETUP_PAGE_KINDS, SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type {
  WikiSynthesisAddressForm,
  WikiSynthesisBrief,
  WikiSynthesisBriefTopic,
} from "@/ee/wiki-crawl/wiki-synthesis-brief";
import type { WikiSynthesisRole } from "@/ee/wiki-crawl/wiki-synthesis.schema";

import { WIKI_SYNTHESIS_MAX_STORED_TOPICS } from "@/ee/wiki-crawl/wiki-synthesis.schema";

export type SetupPageKind = (typeof SETUP_PAGE_KINDS)[number];
export type SetupPageTitle = (kind: SetupPageKind, competitor?: string) => string;

const CHOOSABLE_PAGE_KINDS = [
  "overview",
  "productsPricing",
  "idealCustomer",
  "salesPlaybook",
  "faq",
  "processes",
] as const;
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
  competitor: "competitor",
};
const MAX_COMPETITORS = 10;
const MAX_KEY_LENGTH = 40;

export function setupChosenPageKinds(answers: SetupAnswers): SetupPageKind[] {
  const value = answers.knowledgePages?.value;
  if (value?.format !== "multipleChoice") return [...CHOOSABLE_PAGE_KINDS];
  return CHOOSABLE_PAGE_KINDS.filter((kind) => value.values.includes(kind));
}

export function setupAddressForm(answers: SetupAnswers): WikiSynthesisAddressForm | null {
  const value = answers.addressForm?.value;
  return value?.format === "singleChoice" && (value.value === "formal" || value.value === "informal")
    ? value.value
    : null;
}

export function setupCompetitors(answers: SetupAnswers): string[] {
  const value = answers.competitors?.value;
  if (value?.format !== "orderedList") return [];
  const seen = new Set<string>();
  return value.items
    .flatMap(({ label }) => {
      const name = label.trim();
      const key = name.toLocaleLowerCase();
      if (!name || seen.has(key)) return [];
      seen.add(key);
      return [name];
    })
    .slice(0, MAX_COMPETITORS);
}

export function setupKnowledgeBrief(
  plan: SetupPlan | null,
  answers: SetupAnswers,
  title: SetupPageTitle,
): WikiSynthesisBrief {
  const pages = plan?.knowledgeBase.pages ?? [];
  const chosen = setupChosenPageKinds(answers);
  const keys = new Set<string>();
  const topics: WikiSynthesisBriefTopic[] = [];
  const push = (key: string, kind: SetupPageKind, pageTitle: string, outline: string[], competitor?: string) => {
    let unique = key.slice(0, MAX_KEY_LENGTH);
    for (let suffix = 2; keys.has(unique); suffix += 1) unique = `${key.slice(0, MAX_KEY_LENGTH - 3)}${suffix}`;
    keys.add(unique);
    topics.push({
      key: unique,
      role: PAGE_ROLES[kind],
      title: pageTitle,
      outline,
      ...(competitor ? { competitor } : {}),
    });
  };
  for (const kind of [...chosen, "toneOfVoice" as const]) {
    const planned = pages.filter((page) => page.kind === kind);
    if (planned.length === 0) push(kind, kind, title(kind), []);
    for (const page of SINGLE_PAGE_KINDS.has(kind) ? planned.slice(0, 1) : planned)
      push(page.key, kind, page.title, page.sections);
  }
  const comparisons = pages.filter((page) => page.kind === "competitor");
  for (const [index, competitor] of setupCompetitors(answers).entries()) {
    const name = competitor.toLocaleLowerCase();
    const page = comparisons.find((candidate) => candidate.title.toLocaleLowerCase().includes(name));
    push(
      page?.key ?? `competitor${index + 1}`,
      "competitor",
      page?.title ?? title("competitor", competitor),
      page?.sections ?? [],
      competitor,
    );
  }
  return {
    topics: topics.slice(0, WIKI_SYNTHESIS_MAX_STORED_TOPICS - 1),
    extraRoles: [
      ...(chosen.includes("productsPricing") ? (["offering"] as const) : []),
      ...(chosen.includes("processes") ? (["procedure"] as const) : []),
    ],
    addressForm: setupAddressForm(answers),
  };
}
