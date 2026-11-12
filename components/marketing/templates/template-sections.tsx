import type { TemplateLocale, TemplatePageText, TemplateSpec } from "@/core/templates/template-spec.schema";

import { getTranslations } from "next-intl/server";

import { AppChip } from "@/components/chip/app-chip";
import { AppLink } from "@/components/shared/app-link";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { Step, Steps } from "@/components/marketing/process-steps";
import { formattingTagFor, marketingLocaleOrDefault } from "@/i18n/locale-registry";

import { TemplateCopyPrompt } from "./template-copy-prompt";
import { TemplateStructure } from "./template-structure";

export async function TemplateStepsSection({ signupHref }: { signupHref: string }) {
  const t = await getTranslations("TemplatePages");

  return (
    <MarketingSection className="mk-section-tight" headerAlign="start" id="steps" title={t("stepsTitle")}>
      <Steps className="mx-auto max-w-2xl ps-10 sm:ps-11">
        <Step title={t("step1Title")}>
          <p>{t("step1Body")}</p>

          <p>
            <AppLink appearance="inline" href={signupHref}>
              {t("step1Link")}
            </AppLink>
          </p>
        </Step>

        <Step title={t("step2Title")}>
          <p>{t("step2Body")}</p>
        </Step>

        <Step title={t("step3Title")}>
          <p>{t("step3Body")}</p>
        </Step>
      </Steps>
    </MarketingSection>
  );
}

export async function TemplatePromptSection({
  prompts,
  slug,
}: {
  prompts: { cloud: string; selfHosted: string };
  slug: string;
}) {
  const t = await getTranslations("TemplatePages");

  return (
    <MarketingSection
      className="mk-section-tight"
      description={t("promptLead")}
      headerAlign="start"
      id="prompt"
      title={t("promptTitle")}
    >
      <TemplateCopyPrompt
        cloudPrompt={prompts.cloud}
        idPrefix={`template-prompt-${slug}`}
        labels={{
          cloud: t("promptCloud"),
          copied: t("copied"),
          copy: t("copy"),
          failed: t("copyFailed"),
          promptLabel: t("promptTitle"),
          selfHosted: t("promptSelfHosted"),
          switchLabel: t("promptSwitch"),
        }}
        selfHostedPrompt={prompts.selfHosted}
      />
    </MarketingSection>
  );
}

export async function TemplateCreatesSection({ spec, text }: { spec: TemplateSpec; text: TemplateLocale }) {
  const t = await getTranslations("TemplatePages");
  const counts = [
    t("countLists", { count: spec.lists.length }),
    t("countFields", { count: spec.fields.length + spec.stages.length + spec.calculations.length }),
    t("countViews", { count: spec.views.length }),
    t("countWidgets", { count: spec.widgets.length }),
    t("countRules", { count: spec.followUpRules.length }),
  ];

  return (
    <MarketingSection
      className="mk-section-tight"
      description={t("createsLead")}
      headerAlign="start"
      id="creates"
      title={t("createsTitle")}
    >
      <ul className="mb-8 flex flex-wrap gap-2" data-template-counts="">
        {counts.map((count) => (
          <li key={count}>
            <AppChip variant="secondary">{count}</AppChip>
          </li>
        ))}
      </ul>

      <TemplateStructure
        labels={{
          moreFields: (count) => t("moreFields", { count }),
          stages: t("stagesTitle"),
          views: t("viewsTitle"),
          widgets: t("widgetsTitle"),
        }}
        spec={spec}
        text={text}
      />
    </MarketingSection>
  );
}

export async function TemplateRoutineSection({
  page,
  spec,
  text,
}: {
  page: TemplatePageText;
  spec: TemplateSpec;
  text: TemplateLocale;
}) {
  const t = await getTranslations("TemplatePages");

  return (
    <MarketingSection
      className="mk-section-tight"
      description={t("routineLead")}
      headerAlign="start"
      id="routine"
      title={page.routine.title}
    >
      <ol className="mb-10 grid grid-cols-1 gap-3 md:grid-cols-2" data-template-routine="">
        {page.routine.steps.map((step, index) => (
          <li key={step} className="mk-card flex gap-4 p-5">
            <span className="mk-icon-tile">{index + 1}</span>

            <p className="text-sm leading-6 text-foreground">{step}</p>
          </li>
        ))}
      </ol>

      {spec.followUpRules.length > 0 ? (
        <>
          <h3 className="mk-eyebrow mb-4">{t("rulesTitle")}</h3>

          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" data-template-rules="">
            {spec.followUpRules.map((rule) => (
              <li key={rule.key} className="mk-card flex flex-col gap-2 p-5">
                <p className="text-sm font-semibold">{text.rules[rule.key]?.title}</p>

                {text.rules[rule.key]?.description ? (
                  <p className="text-sm leading-6 text-subdued">{text.rules[rule.key]?.description}</p>
                ) : null}

                <p className="mt-auto flex flex-wrap gap-1.5 pt-2">
                  <AppChip variant="secondary">{rule.needs === "today" ? t("ruleAgent") : t("ruleEngine")}</AppChip>

                  <AppChip variant="secondary">
                    {rule.dueOffsetDays > 0 ? t("ruleDueAfter", { days: rule.dueOffsetDays }) : t("ruleDueSame")}
                  </AppChip>
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </MarketingSection>
  );
}

export async function TemplateKnowledgeSection({ spec, text }: { spec: TemplateSpec; text: TemplateLocale }) {
  if (spec.knowledgePages.length === 0) return null;

  const t = await getTranslations("TemplatePages");

  return (
    <MarketingSection
      className="mk-section-tight"
      description={t("knowledgeLead")}
      headerAlign="start"
      id="knowledge"
      title={t("knowledgeTitle")}
    >
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" data-template-pages="">
        {spec.knowledgePages.map((entry) => {
          const copy = text.knowledgePages[entry.key];
          return (
            <li key={entry.key} className="mk-card p-5">
              <h3 className="text-base font-semibold">{copy?.title}</h3>

              <ul className="mt-3 list-disc ps-5 text-sm leading-6 text-subdued">
                {(copy?.sections ?? []).map((section) => (
                  <li key={section}>{section}</li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </MarketingSection>
  );
}

export async function TemplateLimitsSection({ page }: { page: TemplatePageText }) {
  const t = await getTranslations("TemplatePages");

  return (
    <MarketingSection
      className="mk-section-tight"
      description={t("limitsLead")}
      headerAlign="start"
      id="limits"
      title={t("limitsTitle")}
    >
      <ul className="mk-card flex flex-col gap-3 p-6 text-sm leading-6 text-foreground" data-template-limits="">
        {page.limits.map((limit) => (
          <li key={limit} className="ps-1">
            {limit}
          </li>
        ))}
      </ul>
    </MarketingSection>
  );
}

function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./u, "");
}

export async function TemplateSourcesSection({ locale, spec }: { locale: string; spec: TemplateSpec }) {
  const t = await getTranslations("TemplatePages");
  const format = new Intl.DateTimeFormat(formattingTagFor(marketingLocaleOrDefault(locale)), {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  });

  return (
    <MarketingSection
      className="mk-section-tight"
      description={t("sourcesLead")}
      headerAlign="start"
      id="sources"
      title={t("sourcesTitle")}
    >
      <ul className="flex flex-col gap-2 text-sm" data-template-sources="">
        {spec.sources.map((source) => (
          <li key={source.url} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <AppLink external appearance="inline" href={source.url} rel="noopener noreferrer" target="_blank">
              {hostOf(source.url)}
            </AppLink>

            <time className="text-xs text-subdued" dateTime={source.checkedOn}>
              {t("sourceChecked", { date: format.format(new Date(`${source.checkedOn}T00:00:00Z`)) })}
            </time>
          </li>
        ))}
      </ul>
    </MarketingSection>
  );
}

export async function TemplatePairedSection({
  demoHref,
  pairedHref,
  pairedName,
}: {
  demoHref: string | null;
  pairedHref: string | null;
  pairedName: string | null;
}) {
  if (!pairedHref || !pairedName) return null;

  const t = await getTranslations("TemplatePages");

  return (
    <MarketingSection className="mk-section-tight" headerAlign="start" id="paired" title={t("pairedTitle")}>
      <div className="mk-card flex flex-col gap-3 p-6 text-sm leading-6" data-template-paired="">
        <p>{t("pairedBody", { name: pairedName })}</p>

        <p className="flex flex-wrap gap-x-6 gap-y-2">
          <AppLink appearance="inline" href={pairedHref}>
            {t("pairedLink", { name: pairedName })}
          </AppLink>

          {demoHref ? (
            <AppLink external appearance="inline" href={demoHref} rel="nofollow noopener noreferrer" target="_blank">
              {t("demoLink")}
            </AppLink>
          ) : null}
        </p>
      </div>
    </MarketingSection>
  );
}
