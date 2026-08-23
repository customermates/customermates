import { Bot, Code2, Database, Inbox, PenLine } from "lucide-react";

import { PatternHeader } from "./pattern-header";

import { CTASection } from "@/components/marketing/cta-section";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { MediaPlate } from "@/components/marketing/media-plate";
import {
  ChannelsConverge,
  ComparisonVerdict,
  DetailMarked,
  RecordResolved,
} from "@/components/marketing/illustrations/brand-illustration";
import { Button } from "@/components/ui/button";

const CAPABILITIES = [
  { body: "The agent writes the record while you have the conversation.", icon: PenLine, title: "No data entry" },
  {
    body: "Run the community core yourself, or take the managed EU database.",
    icon: Database,
    title: "Open deployment",
  },
  { body: "REST and webhooks, documented, with an n8n community node.", icon: Code2, title: "Real API surface" },
  { body: "Claude, ChatGPT, Codex or Gemini over MCP. Bring the one you use.", icon: Bot, title: "Your AI client" },
];

const METRICS = [
  { figure: "5", label: "channels in one inbox" },
  { figure: "5", label: "interface languages" },
  { figure: "AGPL-3.0", label: "community core licence" },
  { figure: "EU", label: "managed database region" },
];

const DECIDED = [
  "Surface, border and wash for every element",
  "Display and heading size at every width",
  "Container width, gutter and column count",
  "Radius, transition duration and easing",
];

const LEFT_TO_THE_PAGE = [
  "Which pattern each section takes",
  "Whether a section carries media",
  "The order the patterns appear in",
  "Every word on the page",
];

const STEPS = [
  {
    body: "Point a supported external AI client at the Customermates MCP server and sign in once.",
    title: "Connect your client",
  },
  { body: "Choose which CRM and inbox operations the client is allowed to call.", title: "Set what it may do" },
  { body: "Its changes and drafts wait in Customermates until you approve them.", title: "Review its work" },
];

function IconChip({ icon: Icon }: { icon: typeof Inbox }) {
  return (
    <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <Icon className="size-[18px]" strokeWidth={1.75} />
    </span>
  );
}

function MediaCard({
  body,
  icon,
  illustration,
  title,
}: {
  body: string;
  icon: typeof Inbox;
  illustration: React.ReactNode;
  title: string;
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-card border border-border bg-card">
      <div className="border-b border-border bg-muted">{illustration}</div>

      <div className="flex flex-1 flex-col p-7">
        <IconChip icon={icon} />

        <h3 className="mt-8 text-xl font-medium leading-tight tracking-tight">{title}</h3>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </article>
  );
}

export function SectionPatterns() {
  return (
    <div className="w-full">
      <PatternHeader
        columns="1 → 2 at md"
        id="S-01"
        name="Feature pair, media-led"
        when="Two capabilities that each earn a picture"
      />

      <MarketingSection
        description="Email, LinkedIn, WhatsApp, Instagram and Telegram arrive in one surface, each message already attached to the contact and the deal it concerns."
        title="Every conversation lands on the record it belongs to"
      >
        <div className="marketing-grid mt-14 gap-y-4 lg:mt-16">
          <div className="col-span-12 md:col-span-6">
            <MediaCard
              body="Threads from email, LinkedIn, WhatsApp, Instagram and Telegram, each linked to the contact and deal it belongs to."
              icon={Inbox}
              illustration={<ChannelsConverge />}
              title="One inbox, five channels"
            />
          </div>

          <div className="col-span-12 md:col-span-6">
            <MediaCard
              body="An agent prepares the reply in your voice. It waits in the thread until you send it."
              icon={PenLine}
              illustration={<RecordResolved />}
              title="Drafts you approve"
            />
          </div>
        </div>
      </MarketingSection>

      <PatternHeader
        columns="1 → 2 at sm → 4 at lg"
        id="S-02"
        name="Capability grid"
        when="Four or more short claims of equal weight"
      />

      <MarketingSection description="Four things change on day one." title="A CRM that stops asking you to maintain it">
        <div className="marketing-grid mt-14 gap-y-4 lg:mt-16">
          {CAPABILITIES.map((item) => (
            <article
              key={item.title}
              className="marketing-transition col-span-12 rounded-card border border-border bg-card p-7 hover:border-border-strong sm:col-span-6 lg:col-span-3"
            >
              <IconChip icon={item.icon} />

              <h3 className="mt-7 font-medium leading-snug">{item.title}</h3>

              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </article>
          ))}
        </div>
      </MarketingSection>

      <PatternHeader
        columns="1 → 5 + 5 at lg, two columns of air between"
        id="S-03"
        name="Split, media trailing"
        when="One idea that needs a paragraph and a picture"
      />

      <MarketingSection>
        <div className="marketing-grid items-center gap-y-10">
          <div className="col-span-12 lg:col-span-5">
            <h2 className="text-display-sm m-0">The record updates itself</h2>

            <p className="text-lede mt-5">
              A supported external AI client can use allowed CRM and inbox operations through MCP. You review its
              changes and drafts in Customermates.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg">Start a 7-day trial for 0€</Button>

              <Button size="lg" variant="secondary">
                Read the MCP docs
              </Button>
            </div>
          </div>

          <div className="col-span-12 lg:col-start-8 lg:col-end-13">
            <MediaPlate>
              <DetailMarked />
            </MediaPlate>
          </div>
        </div>
      </MarketingSection>

      <PatternHeader
        columns="1 → 5 + 5 at lg, media in the first row slot"
        id="S-04"
        name="Split, media leading"
        when="The alternate of S-03 — never two of the same handedness in a row"
      />

      <MarketingSection>
        <div className="marketing-grid items-center gap-y-10">
          <div className="col-span-12 lg:col-span-5 lg:row-start-1">
            <MediaPlate>
              <ComparisonVerdict />
            </MediaPlate>
          </div>

          <div className="col-span-12 lg:col-start-8 lg:col-end-13 lg:row-start-1">
            <h2 className="text-display-sm m-0">You decide what the agent may touch</h2>

            <p className="text-lede mt-5">
              Permissions are set per operation, so an AI client can read the pipeline without being able to write to
              it.
            </p>
          </div>
        </div>
      </MarketingSection>

      <PatternHeader
        columns="2 → 4 at md, ruled not carded"
        id="S-05"
        name="Metric row"
        when="Figures that are true without a sentence around them"
      />

      <MarketingSection flush>
        <div className="marketing-grid gap-y-10 border-y border-border py-14">
          {METRICS.map((metric) => (
            <div key={metric.label} className="col-span-6 md:col-span-3">
              <p className="m-0 text-4xl font-medium tracking-tight lg:text-5xl">{metric.figure}</p>

              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{metric.label}</p>
            </div>
          ))}
        </div>
      </MarketingSection>

      <PatternHeader
        columns="1 → 6 / 6 at md"
        id="S-06"
        name="Two-column verdict"
        when="Two sets being weighed against each other"
      />

      <MarketingSection
        description="The system settles everything on the left. Everything on the right is still yours."
        title="What is decided once, and what is not"
      >
        <div className="marketing-grid mt-14 gap-y-4 lg:mt-16">
          <div className="col-span-12 overflow-hidden rounded-card border border-border bg-card md:col-span-6">
            <div className="bg-primary px-7 py-5">
              <h3 className="m-0 font-medium text-primary-foreground">Decided by the system</h3>
            </div>

            <ul className="divide-y divide-border">
              {DECIDED.map((item) => (
                <li key={item} className="px-7 py-4 text-sm">
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="col-span-12 overflow-hidden rounded-card border border-border bg-card md:col-span-6">
            <div className="bg-muted px-7 py-5">
              <h3 className="m-0 font-medium">Left to the page</h3>
            </div>

            <ul className="divide-y divide-border">
              {LEFT_TO_THE_PAGE.map((item) => (
                <li key={item} className="px-7 py-4 text-sm text-muted-foreground">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </MarketingSection>

      <PatternHeader
        columns="wraps, centred"
        id="S-07"
        name="Channel strip"
        when="A set of marks that only needs to be recognised"
      />

      <MarketingSection flush>
        <div className="flex flex-col items-center gap-8 border-y border-border py-14">
          <p className="text-meta">Channels a connected account can carry</p>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {["Email", "LinkedIn", "WhatsApp", "Instagram", "Telegram"].map((channel) => (
              <span
                key={channel}
                className="marketing-transition rounded-full border border-border bg-card px-4 py-2 text-sm hover:border-border-strong"
              >
                {channel}
              </span>
            ))}

            {["X", "Messenger"].map((channel) => (
              <span
                key={channel}
                className="rounded-full border border-dashed border-input px-4 py-2 text-sm text-muted-foreground"
              >
                {channel}
              </span>
            ))}
          </div>

          <p className="text-meta">A dashed rim means conceptual, not connected</p>
        </div>
      </MarketingSection>

      <PatternHeader
        columns="1 → 4 each at md, numbered"
        id="S-08"
        name="Numbered sequence"
        when="Steps that only make sense in order"
      />

      <MarketingSection description="Three steps, once." title="How the connection is set up">
        <div className="marketing-grid mt-14 gap-y-10 lg:mt-16">
          {STEPS.map((step, index) => (
            <div key={step.title} className="col-span-12 md:col-span-4">
              <div className="flex items-baseline gap-4 border-t border-border-strong pt-5">
                <code className="font-mono text-sm text-primary">{String(index + 1).padStart(2, "0")}</code>

                <div>
                  <h3 className="m-0 font-medium leading-snug">{step.title}</h3>

                  <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </MarketingSection>

      <PatternHeader
        columns="centred, measure capped at 3xl"
        id="S-09"
        name="Pull quote"
        when="One sentence that carries a section on its own"
      />

      <MarketingSection flush>
        <figure className="mx-auto flex max-w-3xl flex-col items-center border-y border-border py-16 text-center">
          <blockquote className="m-0">
            <p className="text-display-sm m-0">A wash carries state, never resting elevation.</p>
          </blockquote>

          <figcaption className="text-meta mt-8">The rule every surface decision on this page comes back to</figcaption>
        </figure>
      </MarketingSection>

      <PatternHeader
        columns="full container width"
        id="S-10"
        name="Product proof"
        when="A real capture is the argument"
      />

      <MarketingSection flush>
        <MediaPlate
          caption="Capture at 1920×1080 from a seeded local instance, in the theme the section is written for. Never a mock, never a crop that hides the chrome."
          variant="matted"
        >
          <div className="aspect-hero flex items-center justify-center bg-placeholder">
            <span className="text-meta font-mono">1920 × 1080 · 16:9 · --aspect-hero</span>
          </div>
        </MediaPlate>
      </MarketingSection>

      <PatternHeader
        columns="stacked, measure capped"
        id="S-11"
        name="Closing panel"
        when="The last thing on the page"
      />

      <CTASection
        action="One panel ends every page"
        buttonLeftHref="/pricing"
        buttonLeftText="Primary action"
        buttonRightHref="/docs"
        buttonRightText="Secondary action"
        description="It sits on the canvas rung rather than inverting, so it reads as the end of the page in both themes without a second palette."
        hint="Rendered from the shipped component, not a copy of it."
      />
    </div>
  );
}
