import type { AppLocale } from "@/i18n/locale-registry";
import type { WikiPageInput } from "@/features/wiki/wiki.schema";
import type { OnboardingPlaybook } from "./onboarding-playbook";

import { getTranslator } from "@/i18n/get-translator";
import { wikiPageMarkdownLink } from "@/features/wiki/wiki-links";

export type OnboardingPlaybookPages = {
  pages: WikiPageInput[];
  guide: (pages: Array<{ title: string; id: string }>) => WikiPageInput;
};

type PlaybookCopy = { label: string; salesPlaybook: string; toneOfVoice: string; followUps: string };

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
  return {
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
        `## ${t("guide.pagesHeading")}`,
        pages.map(({ title, id }) => `- ${wikiPageMarkdownLink(title, id)}`).join("\n"),
      ].join("\n\n"),
    }),
  };
}
