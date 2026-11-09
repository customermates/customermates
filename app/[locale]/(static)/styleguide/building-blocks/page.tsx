import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ArrowRight, Bot, Inbox, MessagesSquare, Sparkles } from "lucide-react";

import { StyleguideChapter } from "../components/styleguide-chapter";

import { CTASection } from "@/components/marketing/cta-section";
import { MarketingButton } from "@/components/marketing/marketing-button";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { SectionHeader } from "@/components/marketing/section-header";
import { UseCasesSection } from "@/components/marketing/use-cases-section";
import { LandingSteps } from "@/app/[locale]/(static)/components/landing-sections";
import { enableStaticLocale, type StaticLocaleProps } from "@/i18n/static-locale";

export const metadata: Metadata = {
  title: "Marketing building blocks",
};

function Specimen({ children, code, label }: { children: ReactNode; code: string; label: string }) {
  return (
    <figure data-reveal className="mk-card overflow-hidden">
      <div className="flex min-h-40 flex-wrap items-center justify-center gap-4 bg-background p-8">{children}</div>

      <figcaption className="flex flex-col gap-1 border-t border-border px-5 py-4 sm:flex-row sm:items-baseline sm:justify-between">
        <span className="text-sm font-medium">{label}</span>

        <code className="font-mono text-xs text-muted-foreground">{code}</code>
      </figcaption>
    </figure>
  );
}

const LANDING_SECTIONS = [
  [
    "Landing hero",
    "LandingHero · hero",
    "MarketingHero from the page's hero fields: eyebrow, outcome headline, mechanism lede, one ink primary, a low-risk secondary, then the hint. One line above the title: the eyebrow or the open-source chip.",
  ],
  [
    "Signature visual",
    "sections.visual",
    "Right after the hero: stage (composer plus live stage), followUp, os, film or capture. Proof before any feature list.",
  ],
  [
    "Ways you can use it",
    "sections.useCases",
    "UseCasesSection. Without an override the homepage cards, minus the card that links to the page itself.",
  ],
  [
    "How it works",
    "sections.steps",
    "LandingSteps: three to six numbered cards. The title defaults to the feature name and the step count.",
  ],
  [
    "Highlights",
    "sections.highlights",
    "A start-aligned header and three or four checked points beside a real product capture, phone still on phones.",
  ],
  [
    "Why teams switch",
    "sections.reasons",
    "Comparison pages only: three cards quoted from the page's own section about Customermates.",
  ],
  [
    "Comparison table",
    "comparison",
    "ResponsiveComparisonTable: the Customermates column carries the mk-card-featured ink ring on a wash, checks are ink, and phones get one card per row.",
  ],
  [
    "How to switch",
    "sections.switchSteps",
    "Import a spreadsheet, connect LinkedIn and email, ask Mate for drafts. Only steps the docs describe.",
  ],
  [
    "Article and closing",
    "MDX body · cta",
    "The long-form article with its FAQ, related pages and the closing panel with the trial action and a human alternative.",
  ],
] as const;

const RULES = {
  buttons: [
    "Primary is ink. One per section, always the trial or the page's main action, with the arrow.",
    "Secondary is a white card button for the human or low-risk alternative (film, demo, talk to Ben).",
    "Ghost is for navigation-weight actions such as Login. Never two primaries side by side.",
    "Large (46 px, 48 px on phones) in heroes and closing panels; medium in cards; small in the navigation bar.",
  ],
  cards: [
    "mk-card for static content, mk-card-raised for a panel that should float (closing panel, popovers).",
    "Add mk-card-interactive only when the whole card is a link; it lifts 2 px and strengthens its ring.",
    "mk-card-featured marks the one card we want chosen, such as the Pro plan, with an ink ring, not a tint.",
    "Padding 24 px (p-6), 28 px from sm up for content-heavy cards; radius always from the token.",
  ],
} as const;

export default async function BuildingBlocksPage({ params }: StaticLocaleProps) {
  await enableStaticLocale(params);

  return (
    <StyleguideChapter chapter="building-blocks">
      <MarketingSection
        description="MarketingButton renders every marketing action. Variants and sizes are fixed; pass a className only for layout."
        eyebrow="components/marketing/marketing-button.tsx"
        id="buttons"
        title="Buttons. Ink first, then quiet."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Specimen code='<MarketingButton arrow size="lg">' label="Primary, large">
            <MarketingButton arrow href="/auth/signup" size="lg">
              Start your 14-day trial
            </MarketingButton>
          </Specimen>

          <Specimen code='variant="secondary" size="lg"' label="Secondary, large">
            <MarketingButton href="/contact" size="lg" variant="secondary">
              Talk to Ben, 15 minutes
            </MarketingButton>
          </Specimen>

          <Specimen code='size="md" · variant="ghost"' label="Medium and ghost">
            <MarketingButton href="/pricing">Compare plans</MarketingButton>

            <MarketingButton href="/auth/signin" variant="ghost">
              Login
            </MarketingButton>
          </Specimen>

          <Specimen code='size="sm"' label="Small, navigation bar">
            <MarketingButton href="/auth/signup" size="sm">
              Start free trial
            </MarketingButton>
          </Specimen>
        </div>

        <ul className="mt-6 grid gap-2 md:grid-cols-2">
          {RULES.buttons.map((rule) => (
            <li key={rule} className="mk-body">
              {rule}
            </li>
          ))}
        </ul>
      </MarketingSection>

      <MarketingSection
        description="SectionHeader opens every section: optional eyebrow, a two-tone title split at the first full stop, and a lede. MarketingSection renders it when given a title."
        eyebrow="components/marketing/section-header.tsx"
        id="section-header"
        title="Section header. Ink, then grey."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Specimen code="<SectionHeader eyebrow title description />" label="Centred (default)">
            <SectionHeader
              description="Mate drafts the answer from your playbook and puts the next step on your dashboard."
              eyebrow="Every reply, handled"
              title="Replies drafted. Next steps on your dashboard."
            />
          </Specimen>

          <Specimen code='align="start"' label="Start-aligned, for split layouts">
            <SectionHeader
              align="start"
              description="Your knowledge, your data and your conversations in one place."
              eyebrow="How it works"
              title="Four parts. One workspace."
            />
          </Specimen>
        </div>
      </MarketingSection>

      <MarketingSection
        description="MarketingHero is the top of the homepage and every landing page: GitHub chip, eyebrow, headline, lede, the two actions and up to two footnote lines. LandingHero builds it from the hero frontmatter of features, comparisons, solutions and hubs; PageHero is left for utility pages such as pricing, contact and about."
        eyebrow="components/marketing/marketing-hero.tsx"
        id="hero"
        title="Hero. One promise, one action."
      >
        <div data-reveal className="mk-card overflow-hidden">
          <MarketingHero
            description="Connect LinkedIn and email. Mate or your own AI agent drafts the reply and puts the next step on your dashboard."
            eyebrow="The open-source CRM for following up on every client"
            footnotes={
              <p className="text-muted-foreground">No credit card · Open source (AGPL) · Database in Frankfurt</p>
            }
            primary={{ href: "/auth/signup", label: "Start your 14-day trial" }}
            secondary={{
              href: "#film",
              label: "Watch the film (70 s)",
              play: true,
            }}
            showOpenSourceBadge={false}
            title="Follow up on every client conversation."
          />
        </div>
      </MarketingSection>

      <MarketingSection
        description="One card language: white on the grey page, a hairline ring, and depth only when it means something."
        eyebrow="styles/marketing.css"
        id="cards"
        title="Cards. Paper on paper."
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div data-reveal className="mk-card p-6">
            <span className="mk-icon-tile">
              <MessagesSquare className="size-4" />
            </span>

            <h3 className="mk-title mt-8">mk-card</h3>

            <p className="mk-body mt-2">Static content: a fact, a step, a quote.</p>
          </div>

          <a data-reveal className="mk-card mk-card-interactive group block p-6" href="#cards">
            <span className="mk-icon-tile">
              <Inbox className="size-4" />
            </span>

            <h3 className="mk-title mt-8">mk-card-interactive</h3>

            <p className="mk-body mt-2">The whole card is a link. Hover me.</p>

            <span className="mk-link mt-6">
              Open
              <ArrowRight aria-hidden />
            </span>
          </a>

          <div data-reveal className="mk-card mk-card-featured p-6">
            <span className="mk-badge mk-badge-strong">Best for follow-up</span>

            <h3 className="mk-title mt-8">mk-card-featured</h3>

            <p className="mk-body mt-2">The one card we want chosen.</p>
          </div>

          <div data-reveal className="mk-card-raised p-6">
            <span className="mk-icon-tile">
              <Bot className="size-4" />
            </span>

            <h3 className="mk-title mt-8">mk-card-raised</h3>

            <p className="mk-body mt-2">A panel that floats above the page.</p>
          </div>
        </div>

        <ul className="mt-6 grid gap-2 md:grid-cols-2">
          {RULES.cards.map((rule) => (
            <li key={rule} className="mk-body">
              {rule}
            </li>
          ))}
        </ul>
      </MarketingSection>

      <MarketingSection
        description="Badges label (plan, status). Chips are things you can pick or that link somewhere. The agent badge stays ink: it adds the Mate mark or a sparkle and a label, never a colour."
        eyebrow="styles/marketing.css"
        id="badges-chips"
        title="Badges and chips"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Specimen code="mk-badge · mk-badge-strong · mk-badge-agent" label="Badges">
            <span className="mk-badge">Every plan</span>

            <span className="mk-badge mk-badge-strong">Best for follow-up</span>

            <span className="mk-badge mk-badge-agent">
              <Sparkles className="size-3" />
              Added by Mate
            </span>
          </Specimen>

          <Specimen code="mk-chip (data-interactive for hover)" label="Chips">
            <span className="mk-chip" data-interactive="">
              LinkedIn
            </span>

            <span className="mk-chip" data-interactive="">
              WhatsApp
            </span>

            <span className="mk-chip" data-interactive="">
              Claude
            </span>
          </Specimen>
        </div>
      </MarketingSection>

      <MarketingSection
        description="Text links carry an arrow that nudges two pixels on hover. Icon tiles hold a single 16 px Lucide icon at 1.75 stroke."
        eyebrow="styles/marketing.css"
        id="links"
        title="Links and icon tiles"
      >
        <Specimen code="mk-link · mk-icon-tile" label="Link and tiles">
          <a className="mk-link" href="#links">
            Customermates for consultants
            <ArrowRight aria-hidden />
          </a>

          <span className="mk-icon-tile">
            <Inbox className="size-4" />
          </span>

          <span className="mk-icon-tile">
            <Bot className="size-4" />
          </span>
        </Specimen>
      </MarketingSection>

      <div className="w-full" id="closing">
        <CTASection
          action="Start with the conversation you are behind on."
          buttonLeftHref="/auth/signup"
          buttonLeftText="Start your 14-day trial"
          buttonRightHref="/contact"
          buttonRightText="Talk to Ben, 15 minutes"
          description="Connect LinkedIn or email in two minutes. Mate drafts the first follow-up for you to approve."
          eyebrow="components/marketing/cta-section.tsx"
          hint="No credit card. Cancel anytime."
        />
      </div>

      <MarketingSection
        description="ProductFilm is the one product film, in one frame: right under the hero on the homepage, every solution page (/for/*), the features page and every comparison. It plays when it scrolls into view and never autoplays sound."
        eyebrow="components/marketing/product-film.tsx"
        id="film"
        title="Product film. One film, one frame."
      >
        <ul className="grid gap-4 md:grid-cols-3">
          {[
            ["Placement", "Directly under the hero, before any other section. Never a second film on the same page."],
            ["Frame", "homepage-film-frame around homepage-film, max width 72rem, caption in mk-caption below."],
            ["Copy", "The caption comes from the ProductFilm messages, so every page describes the film the same way."],
          ].map(([name, body]) => (
            <li key={name} data-reveal className="mk-card p-6">
              <h3 className="mk-title">{name}</h3>

              <p className="mk-body mt-3">{body}</p>
            </li>
          ))}
        </ul>
      </MarketingSection>

      <div className="w-full" id="use-cases">
        <UseCasesSection
          useCases={{
            description:
              "components/marketing/use-cases-section.tsx · Right after the film. Three or four cards from the useCases frontmatter field: a product-styled tile without text, a title, one sentence and a link to the matching page. Four on the homepage, three role-specific ones on each solution page.",
            eyebrow: "Ways you can use it",
            items: [
              {
                description: "A thread with the Mate draft waiting for review, for follow-up use cases.",
                href: "/features/follow-up",
                linkLabel: "visual: conversation",
                title: "Conversation",
                visual: "conversation",
              },
              {
                description: "A record with its stage track and a dated next step.",
                href: "/features/pipeline",
                linkLabel: "visual: proposal",
                title: "Proposal",
                visual: "proposal",
              },
              {
                description: "Claude, ChatGPT and Cursor reaching the workspace through MCP.",
                href: "/features/integrations",
                linkLabel: "visual: agent",
                title: "Agent",
                visual: "agent",
              },
            ],
            title: "Use-case cards. Tiles show, copy tells.",
          }}
        />
      </div>

      <MarketingSection
        description="Four visuals are ours alone and appear only where they explain the product. They live in app/[locale]/(static)/components."
        eyebrow="Signature"
        id="signature-visuals"
        title="Signature visuals"
      >
        <ul className="grid gap-4 md:grid-cols-2">
          {[
            [
              "Composer prompt",
              "homepage-workspace-generator.tsx",
              "A chat box with the business description, Send to Mate, Claude, ChatGPT or Cursor, and a hand-drawn arrow into the live workspace.",
            ],
            [
              "Live stage",
              "homepage-product-stage.tsx",
              "The real demo workspace in an iframe with tabs, only from 1024 px where it renders at a readable scale. Tablets get the desktop still, phones a 390 px still of the same tab.",
            ],
            [
              "Follow-up desk",
              "homepage-follow-up-desk.tsx",
              "One conversation read top to bottom: a LinkedIn message, Mate drafting into a card that waits for review, with the next step shown in the thread where Mate added it.",
            ],
            [
              "Operating-system stack",
              "homepage-pillars.tsx",
              "Four isometric layers (Knowledge, Data, Inbox, Agents). Hovering a pillar spreads the stack and lifts its layer.",
            ],
          ].map(([name, file, body]) => (
            <li key={name} data-reveal className="mk-card p-6">
              <h3 className="mk-title">{name}</h3>

              <code className="mt-1 block font-mono text-xs text-muted-foreground">{file}</code>

              <p className="mk-body mt-3">{body}</p>
            </li>
          ))}
        </ul>
      </MarketingSection>

      <MarketingSection
        description="Feature, comparison, solution and hub pages are assembled from the same blocks, chosen per page in the frontmatter (core/fumadocs/schemas/landing-sections.ts). The long-form article with its FAQ follows the blocks, the closing panel ends the page."
        eyebrow="app/[locale]/(static)/components/landing-sections.tsx"
        id="landing-sections"
        title="Landing sections. Same blocks, chosen in content."
      >
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {LANDING_SECTIONS.map(([name, field, body]) => (
            <li key={name} data-reveal className="mk-card p-6">
              <h3 className="mk-title">{name}</h3>

              <code className="mt-1 block font-mono text-xs text-muted-foreground">{field}</code>

              <p className="mk-body mt-3">{body}</p>
            </li>
          ))}
        </ul>
      </MarketingSection>

      <LandingSteps
        eyebrow="LandingSteps · sections.steps"
        id="landing-steps"
        steps={{
          items: [
            {
              description: "Three to six cards, numbered, one sentence or two each.",
              title: "Number the step",
            },
            {
              description: "Titles are actions. Descriptions say what the reader does or sees.",
              title: "Name the action",
            },
            {
              description: "Four steps sit in one row on desktop, three in a narrower row.",
              title: "Keep the rhythm",
            },
          ],
        }}
        title="How it works. In numbered cards."
      />
    </StyleguideChapter>
  );
}
