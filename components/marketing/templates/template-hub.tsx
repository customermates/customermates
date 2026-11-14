import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { CTASection } from "@/components/marketing/cta-section";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { JsonLd } from "@/components/seo/json-ld";
import { resolveCommercialTokens } from "@/core/commercial/commercial-tokens";
import { breadcrumbListSchema, itemListSchema } from "@/core/seo/schemas";
import { pagePublicationOptions } from "@/core/templates/template-deployment";
import { SIGNUP_PATH } from "@/core/templates/template-page-model";
import { hubVisibility, pageTemplates } from "@/core/templates/template-publication";
import { TEMPLATES_HUB_PATH, templatePagePath } from "@/core/templates/templates-source";

import { TemplateGallery } from "./template-gallery";

export async function TemplatesHub({ locale }: { locale: string }) {
  const options = pagePublicationOptions();
  if (hubVisibility(locale, options) === "hidden") notFound();

  const t = await getTranslations("TemplatePages");
  const families = t.raw("families") as Record<string, string>;
  const hubSteps = t.raw("hubSteps") as { approve: string; paste: string; pick: string };
  const steps = [hubSteps.pick, hubSteps.paste, hubSteps.approve];
  const visible = pageTemplates(locale, options);
  const familyIds = [...new Set(visible.map((item) => item.entry.family))];
  const items = visible.map((item) => ({
    family: item.entry.family,
    familyLabel: families[item.entry.family] ?? item.entry.family,
    href: templatePagePath(item.entry.slug),
    name: item.locale.name,
    slug: item.entry.slug,
    summary: item.locale.summary,
  }));
  const trialHint = resolveCommercialTokens(t("trialHint"), locale);

  return (
    <div className="flex flex-col items-center justify-center" data-marketing-flow="continuous">
      <JsonLd
        schema={[
          breadcrumbListSchema([
            { name: t("breadcrumbHome"), path: `/${locale}` },
            { name: t("breadcrumbTemplates"), path: `/${locale}${TEMPLATES_HUB_PATH}` },
          ]),
          itemListSchema(items.map((item) => ({ name: item.name, path: `/${locale}${item.href}` }))),
        ]}
      />

      <MarketingHero
        description={t("hubLede")}
        eyebrow={t("hubEyebrow")}
        footnotes={
          <ol className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {steps.map((step, index) => (
              <li key={step} className="flex items-center gap-2">
                <span className="mk-icon-tile size-6 text-xs">{index + 1}</span>

                {step}
              </li>
            ))}
          </ol>
        }
        primary={{ href: SIGNUP_PATH, label: t("startFree") }}
        secondary={{ href: "#templates", label: t("browse") }}
        showOpenSourceBadge={false}
        title={t("hubTitle")}
      />

      <MarketingSection className="mk-section-tight pt-6 sm:pt-8" id="templates">
        <TemplateGallery
          families={familyIds.map((id) => ({ id, label: families[id] ?? id }))}
          items={items}
          labels={{
            all: t("filterAll"),
            copyPrompt: t("copyPrompt"),
            filterLabel: t("filterLabel"),
            noResults: t("noResults"),
            searchLabel: t("searchLabel"),
            searchPlaceholder: t("searchPlaceholder"),
            worksWith: t("worksWith"),
          }}
        />
      </MarketingSection>

      <CTASection
        action={t("hubCtaAction")}
        buttonLeftHref={SIGNUP_PATH}
        buttonLeftText={t("startFree")}
        buttonRightHref="/pricing"
        buttonRightText={t("ctaPricing")}
        description={t("hubCtaDescription")}
        hint={trialHint}
      />

      <Footer />
    </div>
  );
}
