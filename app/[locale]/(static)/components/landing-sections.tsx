import type { HomepageCaptureName } from "./homepage-captures";
import type {
  CompareSections,
  LandingCapture,
  LandingHighlights as LandingHighlightsContent,
  LandingSteps as LandingStepsContent,
  LandingVisual as LandingVisualContent,
} from "@/core/fumadocs/schemas/landing-sections";
import type { UseCases } from "@/core/fumadocs/schemas/use-cases";

import { Check } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { ProductFilm } from "@/components/marketing/product-film";
import { ProductWindow } from "@/components/marketing/product-window";
import { SectionHeader } from "@/components/marketing/section-header";
import { UseCasesSection } from "@/components/marketing/use-cases-section";
import { homepageSource } from "@/core/fumadocs/source";
import { cn } from "@/core/utils/cn";
import { assetLocaleFor, contentLocaleOrDefault } from "@/i18n/locale-registry";

import { HOMEPAGE_CAPTURES } from "./homepage-captures";
import { HomepageCaptureImage } from "./homepage-capture-image";
import { HomepageFollowUp } from "./homepage-follow-up";
import { HomepagePillars } from "./homepage-pillars";
import { HomepageWorkspacePrompt } from "./homepage-workspace-generator";
import { SolutionProductStage } from "./solution-product-stage";

const CAPTURE_NAMES = {
  "homepage-configure": "homepage-configure",
  "homepage-dashboard": "homepage-dashboard",
  "homepage-draft": "homepage-draft",
  "homepage-inbox": "homepage-inbox",
  "homepage-pipeline": "homepage-pipeline",
  "homepage-pipeline-board": "homepage-pipeline-board",
  "homepage-record": "homepage-record",
  "homepage-routines": "homepage-routines",
  "homepage-thread-linkedin": "homepage-thread-linkedin",
} as const satisfies Record<LandingCapture, HomepageCaptureName>;

const MOBILE_CAPTURES: Partial<Record<LandingCapture, HomepageCaptureName>> = {
  "homepage-configure": "homepage-configure-mobile",
  "homepage-dashboard": "homepage-dashboard-mobile",
  "homepage-inbox": "homepage-inbox-mobile",
  "homepage-pipeline": "homepage-pipeline-mobile",
  "homepage-record": "homepage-record-mobile",
  "homepage-routines": "homepage-routines-mobile",
};

export function homepageContent(locale: string) {
  const page =
    homepageSource.getPage(["homepage"], contentLocaleOrDefault(locale)) ?? homepageSource.getPage(["homepage"], "en");
  if (!page) throw new Error("Homepage content is missing");

  return page.data;
}

function isPortrait(capture: LandingCapture, locale: string) {
  const size = HOMEPAGE_CAPTURES[CAPTURE_NAMES[capture]][assetLocaleFor(contentLocaleOrDefault(locale))];

  return size.height > size.width;
}

function LandingCaptureWindow({ alt, capture, locale }: { alt: string; capture: LandingCapture; locale: string }) {
  const mobileName = MOBILE_CAPTURES[capture];

  return (
    <div
      className={cn(
        "mx-auto w-full",
        isPortrait(capture, locale) && "max-w-[26rem]",
        mobileName && "max-sm:max-w-[19rem]",
      )}
    >
      <ProductWindow className={mobileName ? "max-sm:rounded-[1.6rem]" : undefined}>
        <HomepageCaptureImage
          alt={alt}
          locale={contentLocaleOrDefault(locale)}
          mobileName={mobileName}
          mobileSizes="19rem"
          name={CAPTURE_NAMES[capture]}
          sizes="(min-width: 1280px) 760px, 92vw"
        />
      </ProductWindow>
    </div>
  );
}

export function landingUseCases(locale: string, path: string, override?: UseCases): UseCases {
  if (override) return override;

  const fallback = homepageContent(locale).useCases;
  const items = fallback.items.filter((item) => item.href !== path);

  return { ...fallback, items: items.length >= 3 ? items : fallback.items };
}

export function LandingUseCases(props: { locale: string; override?: UseCases; path: string }) {
  return <UseCasesSection useCases={landingUseCases(props.locale, props.path, props.override)} />;
}

export async function LandingVisual({
  locale,
  name,
  visual,
}: {
  locale: string;
  name: string;
  visual: LandingVisualContent;
}) {
  const homepage = homepageContent(locale);
  const t = await getTranslations("LandingSections");

  switch (visual.kind) {
    case "film":
      return <ProductFilm />;
    case "followUp":
      return <HomepageFollowUp followUp={homepage.followUp} />;
    case "os":
      return <HomepagePillars pillars={homepage.pillars} />;
    case "capture":
      return (
        <MarketingSection className="mk-section-tight w-full" id="product">
          <LandingCaptureWindow
            alt={visual.alt ?? t("captureAlt", { name })}
            capture={visual.capture}
            locale={locale}
          />

          {visual.caption ? (
            <p className="mk-caption mx-auto mt-5 max-w-[40rem] text-center">{visual.caption}</p>
          ) : null}
        </MarketingSection>
      );
    case "stage":
      return (
        <MarketingSection className="mk-section-tight w-full" id="workspace">
          {visual.prompt ? (
            <HomepageWorkspacePrompt
              arrowLabel={homepage.generator.arrowLabel}
              prompt={visual.prompt}
              promptLabel={homepage.generator.promptLabel}
            />
          ) : null}

          <SolutionProductStage
            className={visual.prompt ? "mt-0" : undefined}
            locale={locale}
            solutionId={visual.solution}
          />
        </MarketingSection>
      );
  }
}

export function LandingSteps({
  eyebrow,
  id = "how-it-works",
  steps,
  title,
}: {
  eyebrow?: string;
  id?: string;
  steps: Pick<LandingStepsContent, "description" | "items">;
  title: string;
}) {
  const columns = steps.items.length === 4 ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3";

  return (
    <MarketingSection className="mk-section w-full" id={id}>
      <SectionHeader description={steps.description} eyebrow={eyebrow} title={title} />

      <ol className={cn("mx-auto mt-12 grid max-w-[68rem] gap-4", columns)} data-landing-steps="">
        {steps.items.map((step, index) => (
          <li key={step.title} data-reveal className="mk-card p-6 sm:p-7">
            <span className="text-sm font-medium text-muted-foreground tabular-nums">{`0${index + 1}`}</span>

            <h3 className="mt-6 text-lg font-semibold tracking-tight text-balance text-foreground">{step.title}</h3>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
          </li>
        ))}
      </ol>
    </MarketingSection>
  );
}

export async function FeatureSteps({ name, steps }: { name: string; steps: LandingStepsContent }) {
  const t = await getTranslations("LandingSections");

  return (
    <LandingSteps
      eyebrow={steps.eyebrow ?? t("stepsEyebrow")}
      steps={steps}
      title={steps.title ?? t("stepsTitle", { count: steps.items.length, name })}
    />
  );
}

export async function LandingHighlights({
  highlights,
  locale,
  name,
}: {
  highlights: LandingHighlightsContent;
  locale: string;
  name: string;
}) {
  const t = await getTranslations("LandingSections");

  return (
    <MarketingSection className="mk-section w-full" id="highlights">
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
        <div>
          <SectionHeader
            align="start"
            description={highlights.description}
            eyebrow={highlights.eyebrow ?? t("highlightsEyebrow")}
            title={highlights.title}
          />

          <ul className="mt-10 grid gap-0 border-t border-border" data-landing-highlights="">
            {highlights.items.map((item) => (
              <li key={item.title} data-reveal className="flex gap-4 border-b border-border py-5">
                <Check aria-hidden className="mt-1 size-4 shrink-0 text-foreground" />

                <div className="min-w-0">
                  <h3 className="text-base font-semibold tracking-tight text-foreground">{item.title}</h3>

                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{item.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div data-reveal>
          <LandingCaptureWindow
            alt={highlights.alt ?? t("captureAlt", { name })}
            capture={highlights.capture}
            locale={locale}
          />
        </div>
      </div>
    </MarketingSection>
  );
}

export async function compareEyebrows() {
  const t = await getTranslations("LandingSections");

  return { hero: t("compareEyebrow"), table: t("comparisonEyebrow") };
}

export async function CompareReasons({ reasons }: { reasons: CompareSections["reasons"] }) {
  const t = await getTranslations("LandingSections");

  return (
    <MarketingSection className="mk-section w-full" id="why-switch">
      <SectionHeader eyebrow={t("reasonsEyebrow")} title={t("reasonsTitle")} />

      <ul className="mx-auto mt-12 grid max-w-[68rem] gap-4 md:grid-cols-3" data-compare-reasons="">
        {reasons.map((reason) => (
          <li key={reason.title} data-reveal className="mk-card p-6 sm:p-7">
            <h3 className="text-lg font-semibold tracking-tight text-balance text-foreground">{reason.title}</h3>

            <p className="mt-3 text-sm leading-6 text-muted-foreground">{reason.description}</p>
          </li>
        ))}
      </ul>
    </MarketingSection>
  );
}

export async function CompareSwitchSteps() {
  const t = await getTranslations("LandingSections.switch");

  return (
    <LandingSteps
      eyebrow={t("eyebrow")}
      id="switch"
      steps={{
        items: [
          { description: t("importDescription"), title: t("importTitle") },
          { description: t("connectDescription"), title: t("connectTitle") },
          { description: t("mateDescription"), title: t("mateTitle") },
        ],
      }}
      title={t("title")}
    />
  );
}
