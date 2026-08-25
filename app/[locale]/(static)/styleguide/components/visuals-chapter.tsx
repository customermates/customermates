import { MarketingSection } from "@/components/marketing/marketing-section";

import { getGoldenVisualBrief } from "@/components/marketing/visuals/goldens";
import { StoryVisual } from "@/components/marketing/visuals/story-visual";
import { VISUAL_AGENT_PROVIDER_FIXTURES, VISUAL_STATUS_FIXTURES } from "@/components/marketing/visuals/native-fixtures";
import {
  NativeAgentProviderIdentity,
  NativeStatusBadge,
  PersonIdentity,
  ProviderMark,
} from "@/components/marketing/visuals/native-visual-primitives";
import type {
  BrandIllustrationBrief,
  VisualLocale,
  VisualPlacement,
  VisualTemplate,
} from "@/components/marketing/visuals/visual-contract";

import { ConvergeMotionStudy } from "./converge-motion-study";

const GOLDEN_ORDER: VisualTemplate[] = ["converge", "handoff", "focus"];

const FAMILY_COPY = [
  {
    kind: "brand-illustration",
    summary: "The automatic default: an editorial explanation built from Customermates tokens, never product evidence.",
  },
  {
    kind: "product-proof",
    summary:
      "An explicit capture of reachable local state. It cannot be inferred from prose or rendered by StoryVisual.",
  },
  {
    kind: "none",
    summary: "A valid decision when a section does not earn a focal visual or the copy cannot support one truthfully.",
  },
];

const CONTRACT_ROWS = [
  ["Source", "stable ID, locale, source copy and checksum"],
  ["Reduction", "one takeaway, one focal subject and up to three supporting subjects"],
  ["Meaning", "relationship, change or result, with approved fact references for claims"],
  [
    "Fixtures",
    "an explicit ChatGPT, Claude or Gemini identity for every agent cue, plus subject-bound channel, person, record and Status IDs",
  ],
  ["Copy", "one focal label and up to two short semantic labels in the brief locale"],
  ["Output", "requested placements, pending or selected variant and reference-system version"],
];

const NATIVE_CONVERSATION_EXAMPLES = [
  { person: "anna-mueller", provider: "gmail" },
  { person: "leon-becker", provider: "linkedin" },
  { person: "sophie-wagner", provider: "whatsapp" },
] as const;

const NATIVE_AGENT_PROVIDER_EXAMPLES = Object.keys(VISUAL_AGENT_PROVIDER_FIXTURES) as Array<
  keyof typeof VISUAL_AGENT_PROVIDER_FIXTURES
>;

const DETAIL_BUDGET = [
  {
    budget: "2 units",
    placement: "narrow",
    rule: "Focal identity plus one native provider, state or action.",
  },
  {
    budget: "3 units",
    placement: "split",
    rule: "Focal identity, one context unit and one native state or action.",
  },
  {
    budget: "4 units",
    placement: "wide",
    rule: "Focal identity, up to two evidence units and one native state or action.",
  },
] as const;

const FAILURES = [
  ["Fake application", "A complete invented window, navigation or sidebar is neither illustration nor proof."],
  ["Paragraph in art", "Source prose is retained for traceability but never becomes layout copy."],
  ["Unsupported metric", "A score, KPI or number without an approved fact reference stops validation."],
  ["Automatic proof", "Only a human can explicitly select a reachable local capture as product-proof."],
  ["Generic agent", "An agent cue without one explicitly selected native provider stops validation."],
];

function SelectedThemePair({ brief, placement }: { brief: BrandIllustrationBrief; placement: VisualPlacement }) {
  const selectedVariant = brief.selectedVariant;
  if (!selectedVariant) throw new Error(`${brief.id} needs a selected composition variant`);

  return (
    <div className="grid gap-x-4 gap-y-6 md:grid-cols-2">
      {(["light", "dark"] as const).map((theme) => (
        <figure key={theme} className="m-0 min-w-0">
          <figcaption className="text-meta mb-3 capitalize">{theme}</figcaption>

          <StoryVisual brief={brief} placement={placement} theme={theme} variant={selectedVariant} />
        </figure>
      ))}
    </div>
  );
}

function ResponsiveSelectedGolden({ brief }: { brief: BrandIllustrationBrief }) {
  return (
    <>
      <div className="md:hidden">
        <SelectedThemePair brief={brief} placement="narrow" />
      </div>

      <div className="hidden md:block lg:hidden">
        <SelectedThemePair brief={brief} placement="split" />
      </div>

      <div className="hidden lg:block">
        <SelectedThemePair brief={brief} placement="wide" />
      </div>
    </>
  );
}

export function VisualsChapter({ locale }: { locale: VisualLocale }) {
  return (
    <>
      <MarketingSection
        description="Choose authenticity before composition. The default explains an idea; proof is a separate, explicit evidence path."
        id="families"
        title="Three honest outcomes"
      >
        <div className="marketing-grid mt-12 gap-y-4">
          {FAMILY_COPY.map((family, index) => (
            <article
              key={family.kind}
              className="col-span-12 rounded-card border border-border bg-card p-6 md:col-span-4"
            >
              <p className="font-mono text-sm text-primary">{String(index + 1).padStart(2, "0")}</p>

              <h3 className="mt-4 text-lg font-medium">{family.kind}</h3>

              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{family.summary}</p>
            </article>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection
        description="The renderer receives a reduced, validated brief. Source prose remains attached for traceability and checksum drift, but never enters the artboard."
        id="machine-contract"
        title="A brief an agent can trust"
      >
        <div className="mt-12 overflow-hidden rounded-card border border-border bg-card">
          <ul className="divide-y divide-border">
            {CONTRACT_ROWS.map(([label, description]) => (
              <li key={label} className="grid gap-2 px-5 py-4 md:grid-cols-[10rem_1fr] md:items-baseline">
                <code className="font-mono text-sm text-primary">{label}</code>

                <span className="text-sm text-muted-foreground">{description}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 border-t border-border-strong pt-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between md:gap-8">
            <h3 className="text-lg font-medium">Native visual vocabulary</h3>

            <p className="text-meta">Owned identity marks + synthetic local fixtures · never customer evidence</p>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="grid gap-3 sm:grid-cols-3">
              {NATIVE_CONVERSATION_EXAMPLES.map(({ person, provider }) => (
                <div
                  key={provider}
                  className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-background">
                    <ProviderMark provider={provider} size={22} />
                  </span>

                  <PersonIdentity className="min-w-0" person={person} size={28} />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
              {Object.keys(VISUAL_STATUS_FIXTURES).map((status) => (
                <NativeStatusBadge key={status} status={status as keyof typeof VISUAL_STATUS_FIXTURES} />
              ))}
            </div>
          </div>

          <div className="mt-6 border-t border-border pt-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between md:gap-8">
              <h3 className="text-lg font-medium">Named AI providers</h3>

              <p className="text-meta">Selected in the brief · never inferred from prose or rotated by variant</p>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              {NATIVE_AGENT_PROVIDER_EXAMPLES.map((provider) => (
                <NativeAgentProviderIdentity
                  key={provider}
                  className="rounded-full border border-border bg-card px-3 py-2 text-sm"
                  iconSize={20}
                  provider={provider}
                />
              ))}
            </div>
          </div>

          <div className="mt-6 border-t border-border pt-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between md:gap-8">
              <h3 className="text-lg font-medium">Responsive detail budget</h3>

              <p className="text-meta">One support node still earns one readable fact at most</p>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {DETAIL_BUDGET.map((entry) => (
                <div key={entry.placement} className="border-t border-border-strong pt-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <code className="font-mono text-sm text-primary">{entry.placement}</code>

                    <span className="text-meta">{entry.budget}</span>
                  </div>

                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{entry.rule}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection
        description="A is selected for all three calibrated briefs. The guide now renders the chosen edge composition at its real responsive placements and both themes."
        headingClassName="!hyphens-none !break-normal"
        id="goldens"
        title="Three selected goldens"
      >
        <div className="mt-14 space-y-20">
          {GOLDEN_ORDER.map((template) => {
            const brief = getGoldenVisualBrief(template, locale);

            return (
              <article key={template}>
                <div className="mb-6 flex flex-col gap-2 border-t border-border-strong pt-5 md:flex-row md:items-baseline md:justify-between md:gap-8">
                  <div>
                    <p className="font-mono text-sm text-primary">{template}</p>

                    <h3 className="mt-2 text-xl font-medium">{brief.takeaway}</h3>
                  </div>

                  <p className="text-meta">Selected A · edge</p>
                </div>

                <ResponsiveSelectedGolden brief={brief} />

                {template === "converge" ? <ConvergeMotionStudy brief={brief} locale={locale} /> : null}
              </article>
            );
          })}
        </div>
      </MarketingSection>

      <MarketingSection
        description="Placement is a composition input, not a crop preset. Subjects change position and proportion while the semantic hierarchy stays fixed."
        id="candidates"
        title="One source, three responsive compositions"
      >
        <div className="mt-14 grid items-end gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="text-meta mb-3">wide</p>

            <StoryVisual
              brief={getGoldenVisualBrief("converge", locale)}
              placement="wide"
              theme="dark"
              variant="edge"
            />
          </div>

          <div className="lg:col-span-3">
            <p className="text-meta mb-3">split</p>

            <StoryVisual
              brief={getGoldenVisualBrief("converge", locale)}
              placement="split"
              theme="dark"
              variant="edge"
            />
          </div>

          <div className="lg:col-span-2">
            <p className="text-meta mb-3">narrow</p>

            <StoryVisual
              brief={getGoldenVisualBrief("converge", locale)}
              placement="narrow"
              theme="dark"
              variant="edge"
            />
          </div>
        </div>

        <div className="mt-8 rounded-card border border-border bg-card p-5">
          <code className="font-mono text-sm">yarn marketing:visual-review --golden converge --locale en</code>

          <p className="text-meta mt-3">
            The authoring command validates the source checksum and produces an exhaustive temporary sheet outside the
            public application.
          </p>
        </div>
      </MarketingSection>

      <MarketingSection
        description="These failures are rejected before review, so an agent cannot turn an uncertain claim into persuasive artwork."
        id="failures"
        title="Fail closed"
      >
        <div className="marketing-grid mt-12 gap-y-4">
          {FAILURES.map(([title, explanation]) => (
            <article key={title} className="col-span-12 rounded-card border border-border bg-card p-6 md:col-span-6">
              <h3 className="font-medium">{title}</h3>

              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{explanation}</p>
            </article>
          ))}
        </div>
      </MarketingSection>
    </>
  );
}
