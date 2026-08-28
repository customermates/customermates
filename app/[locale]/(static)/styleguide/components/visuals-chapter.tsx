import { MarketingSection } from "@/components/marketing/marketing-section";

import { getGoldenVisualBrief, type GoldenVisualBrief } from "@/components/marketing/visuals/goldens";
import { GoldenStoryVisual } from "@/components/marketing/visuals/story-visual";
import {
  VISUAL_AGENT_PROVIDER_FIXTURES,
  VISUAL_AUTOMATION_PROVIDER_FIXTURES,
  VISUAL_STATUS_FIXTURES,
} from "@/components/marketing/visuals/native-fixtures";
import {
  NativeAgentProviderIdentity,
  NativeAutomationProviderIdentity,
  NativeStatusBadge,
  PersonIdentity,
  ProviderMark,
} from "@/components/marketing/visuals/native-visual-primitives";
import { COMPOUND_CONNECTOR_STROKE } from "@/components/marketing/visuals/story-visual-layout";
import { VisualArtboard } from "@/components/marketing/visuals/visual-artboard";
import type { VisualLocale, VisualPathway, VisualPlacement } from "@/components/marketing/visuals/visual-contract";

const GOLDEN_ORDER: VisualPathway[] = ["converge", "handoff", "focus"];

const FAMILY_COPY = [
  {
    kind: "brand-illustration",
    summary: "The automatic default: an editorial explanation built from Customermates tokens, never product evidence.",
  },
  {
    kind: "product-proof",
    summary:
      "An explicit capture of reachable local state. It cannot be inferred from prose or rendered by the golden benchmark renderer.",
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
    "an explicit ChatGPT, Claude, Cursor or Gemini identity for every agent cue; n8n is a separate automation cue; channel, person, conversation, record and Status IDs remain subject-bound",
  ],
  [
    "Composites",
    "a registered provider-set or Kanban-board fixture counts as one supporting subject; arbitrary provider arrays and invented board data are rejected",
  ],
  ["Copy", "one focal label and up to two short semantic labels in the brief locale"],
  [
    "Output",
    "requested placements, semantic pathway and reference-system version; production geometry remains an authoring decision outside the golden renderer",
  ],
];

const NATIVE_CONVERSATION_EXAMPLES = [
  { person: "anna-mueller", provider: "gmail" },
  { person: "leon-becker", provider: "linkedin" },
  { person: "sophie-wagner", provider: "whatsapp" },
] as const;

const NATIVE_AGENT_PROVIDER_EXAMPLES = Object.keys(VISUAL_AGENT_PROVIDER_FIXTURES) as Array<
  keyof typeof VISUAL_AGENT_PROVIDER_FIXTURES
>;

const NATIVE_AUTOMATION_PROVIDER_EXAMPLES = Object.keys(VISUAL_AUTOMATION_PROVIDER_FIXTURES) as Array<
  keyof typeof VISUAL_AUTOMATION_PROVIDER_FIXTURES
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
    rule: "Focal identity, one composite context and one native state or action. Repeated fixture rows stay subordinate.",
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
  ["Identity crossover", "An AI client cannot masquerade as automation, and n8n cannot masquerade as an AI agent."],
];

function BenchmarkThemePair({ brief, placement }: { brief: GoldenVisualBrief; placement: VisualPlacement }) {
  return (
    <div className="grid gap-x-4 gap-y-6 md:grid-cols-2">
      {(["light", "dark"] as const).map((theme) => (
        <figure key={theme} className="m-0 min-w-0">
          <figcaption className="text-meta mb-3 capitalize">{theme}</figcaption>

          <GoldenStoryVisual brief={brief} placement={placement} theme={theme} />
        </figure>
      ))}
    </div>
  );
}

function ResponsiveGoldenBenchmark({ brief }: { brief: GoldenVisualBrief }) {
  return (
    <>
      <div className="md:hidden">
        <BenchmarkThemePair brief={brief} placement="narrow" />
      </div>

      <div className="hidden md:block lg:hidden">
        <BenchmarkThemePair brief={brief} placement="split" />
      </div>

      <div className="hidden lg:block">
        <BenchmarkThemePair brief={brief} placement="wide" />
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
        description="Every visual starts from a reduced, validated brief. Source prose remains attached for traceability and checksum drift, but never enters the artboard."
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

              <p className="text-meta">
                Chosen explicitly from the approved catalogue · source wording need not dictate it
              </p>
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
              <h3 className="text-lg font-medium">Automation providers</h3>

              <p className="text-meta">A separate automation cue, never an AI-agent identity</p>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              {NATIVE_AUTOMATION_PROVIDER_EXAMPLES.map((provider) => (
                <NativeAutomationProviderIdentity
                  key={provider}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
                  descriptor="Automation"
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

          <div className="mt-6 rounded-card border border-border bg-card p-5">
            <code className="font-mono text-sm">yarn marketing:visual-catalog</code>

            <p className="text-meta mt-3">
              Lists the approved AI and channel providers, role-safe synthetic people, seeded conversations and
              pairings, registered provider sets, deal boards, records and statuses from the committed demo catalogue.
              It never queries a runtime database.
            </p>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection
        description="Lines are authored as geometry, not decoration. They finish exactly at opaque surfaces and remain visually stable when several branches become one."
        id="connection-geometry"
        title="Connections meet cleanly"
      >
        <div className="marketing-grid mt-12 items-center gap-y-8">
          <div className="col-span-12 lg:col-span-7">
            <VisualArtboard aria-label="Three sources merge into one focal record" className="aspect-[8/5]">
              <svg aria-hidden className="absolute inset-0 size-full" preserveAspectRatio="none" viewBox="0 0 800 500">
                <path
                  d="M116 130 C230 130 245 250 360 250 M116 250 C230 250 245 250 360 250 M116 370 C230 370 245 250 360 250 M360 250 H474"
                  fill="none"
                  stroke={COMPOUND_CONNECTOR_STROKE}
                  strokeLinecap="butt"
                  strokeWidth="2"
                />
              </svg>

              {["ChatGPT", "Claude", "Gemini"].map((provider, index) => (
                <div
                  key={provider}
                  className="absolute left-[8%] flex h-10 w-[22%] items-center rounded-full border border-border bg-card px-4 text-xs font-medium"
                  style={{ top: `${20 + index * 24}%` }}
                >
                  {provider}
                </div>
              ))}

              <div className="absolute top-[34%] left-[59.25%] w-[31%] rounded-card border border-border-strong bg-card p-5">
                <p className="text-meta">Focal record</p>

                <p className="mt-3 font-medium">One connected result</p>
              </div>
            </VisualArtboard>
          </div>

          <div className="col-span-12 lg:col-start-9 lg:col-end-13">
            <ul className="divide-y divide-border border-y border-border text-sm leading-relaxed text-muted-foreground">
              <li className="py-3">Terminate at the exact node or card border; never leave a gap or overrun.</li>

              <li className="py-3">Keep every connector behind the opaque surfaces it touches.</li>

              <li className="py-3">
                Author joined branches as one compound path with one opaque token-derived stroke.
              </li>

              <li className="py-3">Use butt caps and separately authored ports for wide, split and narrow layouts.</li>

              <li className="py-3">
                A provider orbit is one semantic supporting subject, not an unbounded subject list.
              </li>
            </ul>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection
        description="Each semantic pathway has one registered golden. It establishes the quality floor without becoming a composition template for future visuals."
        headingClassName="!hyphens-none !break-normal"
        id="goldens"
        title="Three calibrated goldens"
      >
        <div className="mt-14 space-y-20">
          {GOLDEN_ORDER.map((pathway) => {
            const brief = getGoldenVisualBrief(pathway, locale);

            return (
              <article key={pathway}>
                <div className="mb-6 flex flex-col gap-2 border-t border-border-strong pt-5 md:flex-row md:items-baseline md:justify-between md:gap-8">
                  <div>
                    <p className="font-mono text-sm text-primary">{pathway}</p>

                    <h3 className="mt-2 text-xl font-medium">{brief.takeaway}</h3>
                  </div>

                  <p className="text-meta">Registered golden benchmark</p>
                </div>

                <ResponsiveGoldenBenchmark brief={brief} />
              </article>
            );
          })}
        </div>
      </MarketingSection>

      <MarketingSection
        description="The Converge golden demonstrates responsive recomposition rather than cropping. Future visuals may author different geometry while preserving the same hierarchy and placement discipline."
        id="responsive-benchmark"
        title="One benchmark, three responsive placements"
      >
        <div className="mt-14 grid items-end gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="text-meta mb-3">wide</p>

            <GoldenStoryVisual brief={getGoldenVisualBrief("converge", locale)} placement="wide" theme="dark" />
          </div>

          <div className="lg:col-span-3">
            <p className="text-meta mb-3">split</p>

            <GoldenStoryVisual brief={getGoldenVisualBrief("converge", locale)} placement="split" theme="dark" />
          </div>

          <div className="lg:col-span-2">
            <p className="text-meta mb-3">narrow</p>

            <GoldenStoryVisual brief={getGoldenVisualBrief("converge", locale)} placement="narrow" theme="dark" />
          </div>
        </div>

        <div className="mt-8 rounded-card border border-border bg-card p-5">
          <code className="font-mono text-sm">yarn marketing:visual-review --golden converge --locale en</code>

          <p className="text-meta mt-3">
            The golden command renders the one registered benchmark across themes and placements. A custom --input brief
            receives its pathway golden as a reference and remains free to author its own composition.
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
