import type { TemplateVisibility } from "@/core/templates/template-publication";

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { buildProductDemoUrl } from "@/components/marketing/product-demo";
import { CTASection } from "@/components/marketing/cta-section";
import { Faq, FaqItem } from "@/components/marketing/faq";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { PageUpdatedAt } from "@/components/marketing/page-updated-at";
import { JsonLd } from "@/components/seo/json-ld";
import { featurePagesSource, forPagesSource } from "@/core/fumadocs/source";
import { resolveCommercialTokens } from "@/core/commercial/commercial-tokens";
import { breadcrumbListSchema, webPageSchema } from "@/core/seo/schemas";
import { findSolutionByLandingPath } from "@/core/solutions/solution-catalog";
import { loadTemplateBundle } from "@/core/templates/template-bundle-loader";
import { pagePublicationOptions } from "@/core/templates/template-deployment";
import { templatePrompts, templateSignupPath } from "@/core/templates/template-page-model";
import { pageTemplates } from "@/core/templates/template-publication";
import { templatePagePath } from "@/core/templates/templates-source";
import { isMarketingPathPublished } from "@/i18n/locale-registry";

import { SwitchKitSection } from "./switch-kit";
import { TemplateCard } from "./template-card";
import {
  TemplateCreatesSection,
  TemplateKnowledgeSection,
  TemplateLimitsSection,
  TemplatePairedSection,
  TemplatePromptSection,
  TemplateRoutineSection,
  TemplateSourcesSection,
  TemplateStepsSection,
} from "./template-sections";

type Props = {
  locale: string;
  slug: string;
  visibility: Extract<TemplateVisibility, "own" | "proof">;
};

type Paired = { demoHref: string | null; href: string | null; name: string | null };

function pairedPage(locale: string, path: string | undefined): Paired {
  const empty: Paired = { demoHref: null, href: null, name: null };
  const match = path ? /^\/(for|features)\/([a-z0-9-]+)$/u.exec(path) : null;
  if (!path || !match || !isMarketingPathPublished(locale, path)) return empty;

  const [, base, slug] = match;
  const name =
    base === "for"
      ? forPagesSource.getPage([slug], locale)?.data.industryName
      : featurePagesSource.getPage([slug], locale)?.data.featureName;
  if (!name) return empty;

  const solution = findSolutionByLandingPath(path);
  return { demoHref: solution ? buildProductDemoUrl(locale, "/dashboard", solution.id) : null, href: path, name };
}

function relatedCards(families: Record<string, string>, locale: string, slug: string, family: string) {
  return pageTemplates(locale, pagePublicationOptions())
    .filter((item) => item.entry.family === family && item.entry.slug !== slug)
    .slice(0, 3)
    .map((item) => ({
      family: item.entry.family,
      familyLabel: families[item.entry.family] ?? item.entry.family,
      href: templatePagePath(item.entry.slug),
      name: item.locale.name,
      slug: item.entry.slug,
      summary: item.locale.summary,
    }));
}

export async function TemplateDetail({ locale, slug, visibility }: Props) {
  const bundle = await loadTemplateBundle(slug);
  const text = bundle?.text[locale];
  if (!bundle || !text?.page) notFound();

  const { page } = text;
  const { spec } = bundle;
  const t = await getTranslations("TemplatePages");
  const families = t.raw("families") as Record<string, string>;
  const path = `/${locale}${templatePagePath(slug)}`;
  const paired = pairedPage(locale, spec.pairedPages[locale]);
  const related = visibility === "own" ? relatedCards(families, locale, slug, spec.family) : [];
  const lastModified = new Date(`${spec.reviewedAt}T00:00:00Z`);
  const signupHref = templateSignupPath(slug);
  const trialHint = resolveCommercialTokens(t("trialHint"), locale);

  return (
    <div
      className="flex flex-col items-center justify-center"
      data-marketing-flow="continuous"
      data-template-page={slug}
    >
      <JsonLd
        schema={[
          breadcrumbListSchema([
            { name: t("breadcrumbHome"), path: `/${locale}` },
            { name: t("breadcrumbTemplates"), path: `/${locale}/templates` },
            { name: text.name, path },
          ]),
          webPageSchema({
            dateModified: lastModified,
            description: page.metaDescription,
            locale,
            name: page.metaTitle,
            path,
          }),
        ]}
      />

      <MarketingHero
        description={page.answer}
        eyebrow={families[spec.family]}
        footnotes={
          <>
            <p className="text-muted-foreground">{trialHint}</p>

            <div className="mt-1 text-xs text-muted-foreground">
              <PageUpdatedAt date={lastModified} locale={locale} />
            </div>
          </>
        }
        primary={{ href: signupHref, label: t("startFree") }}
        secondary={{ href: "#prompt", label: t("copyPrompt") }}
        showOpenSourceBadge={false}
        title={page.headline}
      />

      <TemplateStepsSection signupHref={signupHref} />

      <TemplatePromptSection prompts={templatePrompts(spec, text, locale)} slug={slug} />

      <TemplateCreatesSection spec={spec} text={text} />

      <TemplateRoutineSection page={page} spec={spec} text={text} />

      <TemplateKnowledgeSection spec={spec} text={text} />

      {spec.family === "custom" ? (
        <MarketingSection className="mk-section-tight" headerAlign="start" id="switch-kits">
          <SwitchKitSection locale={locale} />
        </MarketingSection>
      ) : null}

      <TemplateLimitsSection page={page} />

      <TemplatePairedSection demoHref={paired.demoHref} pairedHref={paired.href} pairedName={paired.name} />

      <MarketingSection className="mk-section-tight" headerAlign="start" id="faq" title={t("faqTitle")}>
        <div className="max-w-[48rem]">
          <Faq>
            {page.faq.map((entry) => (
              <FaqItem key={entry.question} question={entry.question}>
                {entry.answer}
              </FaqItem>
            ))}
          </Faq>
        </div>
      </MarketingSection>

      <TemplateSourcesSection locale={locale} spec={spec} />

      {related.length > 0 ? (
        <MarketingSection className="mk-section-tight" headerAlign="start" id="related" title={t("relatedTitle")}>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {related.map((card) => (
              <TemplateCard key={card.slug} copyLabel={t("copyPrompt")} data={card} worksWith={t("worksWith")} />
            ))}
          </ul>
        </MarketingSection>
      ) : null}

      <CTASection
        action={t("ctaAction", { name: text.name })}
        buttonLeftHref={signupHref}
        buttonLeftText={t("startFree")}
        buttonRightHref="/pricing"
        buttonRightText={t("ctaPricing")}
        description={t("ctaDescription")}
        hint={trialHint}
      />

      <Footer />
    </div>
  );
}
