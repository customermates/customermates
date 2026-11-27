import type { AppLocale } from "@/i18n/locale-registry";
import type { WikiPageInput } from "@/features/wiki/wiki.schema";
import type { OnboardingPlaybook } from "./onboarding-playbook";

import { getTranslator } from "@/i18n/get-translator";
import { wikiPageMarkdownLink } from "@/features/wiki/wiki-links";

type PlaybookPageKey = "salesPlaybook" | "toneOfVoice" | "followUps";
type CreatedPage = { title: string; id: string };

const PLAYBOOK_PAGE_KEYS: readonly PlaybookPageKey[] = ["salesPlaybook", "toneOfVoice", "followUps"];

export const PLAYBOOK_PAGE_RELATIONS: Record<PlaybookPageKey, readonly PlaybookPageKey[]> = {
  salesPlaybook: ["followUps", "toneOfVoice"],
  followUps: ["salesPlaybook", "toneOfVoice"],
  toneOfVoice: [],
};

export type OnboardingPlaybookPages = {
  pages: WikiPageInput[];
  guide: (pages: CreatedPage[]) => WikiPageInput;
  related: (pages: CreatedPage[], guide: CreatedPage) => Array<{ id: string; section: string }>;
  relatedHeading: string;
};

function linkList(pages: CreatedPage[]): string {
  return pages.map(({ title, id }) => `- ${wikiPageMarkdownLink(title, id)}`).join("\n");
}

type PlaybookCopy = { label: string; salesPlaybook: string; toneOfVoice: string; followUps: string };

function keyedGroups(
  entries: Array<{ key: PlaybookPageKey; page: CreatedPage }>,
  knowledgeHeading: string,
  proceduresHeading: string,
): string[] {
  const procedures = entries.filter(({ key }) => key === "followUps").map(({ page }) => page);
  const knowledge = entries.filter(({ key }) => key !== "followUps").map(({ page }) => page);
  return [
    ...(procedures.length ? [`## ${proceduresHeading}\n\n${linkList(procedures)}`] : []),
    ...(knowledge.length ? [`## ${knowledgeHeading}\n\n${linkList(knowledge)}`] : []),
  ];
}

export async function onboardingPlaybookPages(
  locale: AppLocale,
  playbook: OnboardingPlaybook,
): Promise<OnboardingPlaybookPages> {
  const t = await getTranslator(locale, "OnboardingPlaybooks");
  const copy: Record<OnboardingPlaybook, PlaybookCopy> = {
    consultants: {
      label: t("consultants.label"),
      salesPlaybook: t("consultants.salesPlaybook"),
      toneOfVoice: t("consultants.toneOfVoice"),
      followUps: t("consultants.followUps"),
    },
    agencies: {
      label: t("agencies.label"),
      salesPlaybook: t("agencies.salesPlaybook"),
      toneOfVoice: t("agencies.toneOfVoice"),
      followUps: t("agencies.followUps"),
    },
    freelancers: {
      label: t("freelancers.label"),
      salesPlaybook: t("freelancers.salesPlaybook"),
      toneOfVoice: t("freelancers.toneOfVoice"),
      followUps: t("freelancers.followUps"),
    },
    smb: {
      label: t("smb.label"),
      salesPlaybook: t("smb.salesPlaybook"),
      toneOfVoice: t("smb.toneOfVoice"),
      followUps: t("smb.followUps"),
    },
  };
  const chosen = copy[playbook];
  const links = await getTranslator(locale, "WikiSetup.generated.links");
  const relatedHeading = links("related");
  const keyed = (pages: CreatedPage[]) =>
    PLAYBOOK_PAGE_KEYS.map((key, index) => ({ key, page: pages[index] })).filter(
      (entry): entry is { key: PlaybookPageKey; page: CreatedPage } => Boolean(entry.page),
    );
  return {
    relatedHeading,
    related: (pages, guide) =>
      keyed(pages).map(({ key, page }) => {
        const neighbours = keyed(pages)
          .filter((entry) => PLAYBOOK_PAGE_RELATIONS[key].includes(entry.key))
          .map((entry) => entry.page);
        return { id: page.id, section: `## ${relatedHeading}\n\n${linkList([guide, ...neighbours])}` };
      }),
    pages: [
      { title: t("pages.salesPlaybook"), kind: "knowledge", markdown: chosen.salesPlaybook },
      { title: t("pages.toneOfVoice"), kind: "knowledge", markdown: chosen.toneOfVoice },
      {
        title: t("pages.followUps"),
        kind: "procedure",
        whenToUse: t("followUpsWhenToUse"),
        markdown: chosen.followUps,
      },
    ],
    guide: (pages) => ({
      title: t("pages.guide"),
      kind: "guide",
      markdown: [
        t("guide.intro", { playbook: chosen.label }),
        ...keyedGroups(keyed(pages), links("knowledge"), links("procedures")),
      ].join("\n\n"),
    }),
  };
}
