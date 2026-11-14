import { getTranslations } from "next-intl/server";

import { AppLink } from "@/components/shared/app-link";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { loadTemplateBundle } from "@/core/templates/template-bundle-loader";
import { pagePublicationOptions } from "@/core/templates/template-deployment";
import { templatePrompts } from "@/core/templates/template-page-model";
import { templatesPairedWith } from "@/core/templates/template-publication";
import { templatePagePath } from "@/core/templates/templates-source";

import { TemplateCopyButton } from "./template-copy-button";

type Props = {
  locale: string;
  path: string;
};

export async function TemplateProofBlock({ locale, path }: Props) {
  const paired = templatesPairedWith(locale, path, pagePublicationOptions());
  if (paired.length === 0) return null;

  const t = await getTranslations("TemplatePages");
  const cards = (
    await Promise.all(
      paired.map(async (item) => {
        const bundle = await loadTemplateBundle(item.entry.slug);
        const text = bundle?.text[locale];
        if (!bundle || !text) return null;
        return {
          href: item.visibility === "block" ? null : templatePagePath(item.entry.slug),
          lists: bundle.spec.lists.map((list) => text.lists[list.key]?.pluralLabel).filter(Boolean),
          name: text.name,
          prompt: templatePrompts(bundle.spec, text, locale).cloud,
          slug: item.entry.slug,
          summary: text.summary,
        };
      }),
    )
  ).filter((card) => card !== null);
  if (cards.length === 0) return null;

  return (
    <MarketingSection
      className="mk-section-tight"
      description={t("proofLead")}
      headerAlign="start"
      id="template"
      title={t("proofTitle")}
    >
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2" data-template-proof="">
        {cards.map((card) => (
          <li key={card.slug} className="mk-card flex flex-col gap-3 p-6" data-template-proof-card={card.slug}>
            <h3 className="text-lg font-semibold">{card.name}</h3>

            <p className="text-sm leading-6 text-subdued">{card.summary}</p>

            <p className="text-sm leading-6">
              <span className="font-medium">{t("proofSetsUp")}: </span>

              {card.lists.join(", ")}
            </p>

            <p className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 pt-2">
              <TemplateCopyButton
                copiedLabel={t("copied")}
                failedLabel={t("copyFailed")}
                label={t("copyPrompt")}
                value={card.prompt}
              />

              {card.href ? (
                <AppLink appearance="inline" className="text-sm" href={card.href}>
                  {t("proofOpen")}
                </AppLink>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
    </MarketingSection>
  );
}
