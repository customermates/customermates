import { ThemePair } from "./theme-pair";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { ChatDraftScene } from "@/components/marketing/scenes/chat-draft-scene";
import { ConnectScene } from "@/components/marketing/scenes/connect-scene";
import { LivingChatDraft } from "@/components/marketing/scenes/living-chat-draft";
import { RecordScene } from "@/components/marketing/scenes/record-scene";

const DELIVERABLES = [
  {
    body: "One chosen frame of a scene, frozen. Used as a hero, a section illustration, or exported as a card.",
    name: "Static scene",
    ask: "Draw us a picture of X",
  },
  {
    body: "The same scene driven by a clock. A message arrives, a draft is written, a human sends it.",
    name: "Living scene",
    ask: "Make it move",
  },
  {
    body: "The same scene captured frame by frame. Silent, short, looping.",
    name: "Quick video",
    ask: "Make us a clip",
  },
];

const SCENE_RULES = [
  "A scene depicts one product state the product can actually reach. Never a composite, never a feature that does not exist.",
  "Radically reduced. Only the interface the point needs, at type sizes far larger than the real app uses.",
  "The window sits on the raised rung with one border and the card radius, exactly like every other surface.",
  "Crop where the content genuinely continues, so the window runs off the frame edge rather than floating whole. The crop may never cut the accent.",
  "One ambient ground: a single radial accent glow. This is the only gradient the system allows.",
  "Exactly one accent, on the payoff. A dashed rim means provisional, whether that is an unsupported channel or an unsent draft.",
];

const LIVING_RULES = [
  "The scene is a pure function of one clock value. No accumulated state, so the same t always renders the same frame.",
  "Typing runs at 18 to 32 characters a second. Faster than reading is decoration.",
  "The resolved state holds for at least 1.2 seconds before the loop restarts.",
  "One primary motion at a time. Two things moving for the same reason is one thing too many.",
  "The clock stops when the scene scrolls out of view and when the tab is hidden.",
  "Reduced motion renders the resolved frame as a still and never starts the clock at all.",
];

const VIDEO_RULES = [
  "16:9 at 1920 by 1080, six to fifteen seconds, one verb-and-object proof.",
  "Legible with the sound off, because it will always be watched that way.",
  "A clear start state, a held result, and a loop that returns to the first frame.",
  "Embedded muted, looping and inline, in the same card frame a screenshot would use.",
  "Rendered from the living scene, so the same command reproduces the same file.",
];

const DONTS = [
  { dont: "Two accents in one frame", why: "the eye has to choose, so nothing is the payoff" },
  { dont: "Real application density", why: "a scene is a poster, and a poster nobody can read is decoration" },
  { dont: "A state the product cannot reach", why: "the picture becomes a claim, and an untrue one" },
  { dont: "A gradient on the window itself", why: "the ground carries the atmosphere; the surface stays a flat rung" },
  { dont: "Motion with no held resolution", why: "the viewer sees activity and learns nothing" },
];

export function VisualStandards() {
  return (
    <>
      <MarketingSection
        description="Three things can be asked of an agent, and all three are the same scene at a different length of time. That is what keeps them consistent: one composition, frozen, driven, or captured."
        id="standards"
        title="The three visual deliverables"
      >
        <div className="marketing-grid mt-14 gap-y-4 lg:mt-16">
          {DELIVERABLES.map((item) => (
            <article
              key={item.name}
              className="col-span-12 rounded-card border border-border bg-card p-7 md:col-span-4"
            >
              <code className="font-mono text-sm text-primary">{item.ask}</code>

              <h3 className="mt-4 font-medium leading-snug">{item.name}</h3>

              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </article>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection
        description="A drawn product window at poster fidelity, not a screenshot. The reference sites build these as live markup rather than bitmaps, which is what lets one scene serve all three deliverables."
        title="Standard one — the static scene"
      >
        <div className="marketing-grid mt-14 gap-y-4 lg:mt-16">
          {SCENE_RULES.map((rule, index) => (
            <div
              key={rule}
              className="col-span-12 rounded-card border border-border bg-card p-6 md:col-span-6 lg:col-span-4"
            >
              <code className="font-mono text-sm text-primary">{String(index + 1).padStart(2, "0")}</code>

              <p className="mt-3 text-sm leading-relaxed">{rule}</p>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-14 max-w-3xl overflow-hidden rounded-card border border-border bg-card">
          <div className="text-eyebrow border-b border-border px-6 py-3.5">Two regimes, not one shrunk picture</div>

          <ul className="divide-y divide-border">
            {[
              { note: "landscape frame, body text at 2% of the frame width", when: "from 40rem" },
              { note: "portrait frame, body text at 3.9% of the frame width", when: "below 40rem" },
            ].map((row) => (
              <li key={row.when} className="flex flex-wrap items-baseline gap-x-5 gap-y-1 px-6 py-3.5">
                <code className="text-meta w-32 shrink-0 font-mono">{row.when}</code>

                <span className="text-sm text-muted-foreground">{row.note}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-meta mx-auto mt-6 max-w-3xl text-center">
          A sixteen-by-nine poster at a 375px viewport is 335px wide and 188px tall, and the body text lands at 6.7px.
          No tuning fixes that, so the small regime turns the frame portrait and roughly doubles the type against it.
          The composition does not change; how much of the frame one window may occupy does.
        </p>

        <div className="mt-16 flex flex-col gap-14">
          <div>
            <div className="mb-5 flex flex-col gap-2 border-t border-border-strong pt-5 lg:flex-row lg:items-baseline lg:justify-between">
              <code className="font-mono text-sm text-primary">{"<ChatDraftScene />"}</code>

              <span className="text-meta">A draft waiting for a human. Accent on the send affordance.</span>
            </div>

            <ThemePair>
              <ChatDraftScene />
            </ThemePair>
          </div>

          <div>
            <div className="mb-5 flex flex-col gap-2 border-t border-border-strong pt-5 lg:flex-row lg:items-baseline lg:justify-between">
              <code className="font-mono text-sm text-primary">{"<RecordScene />"}</code>

              <span className="text-meta">The record that updated itself. Accent on the row the agent wrote.</span>
            </div>

            <RecordScene />
          </div>

          <div>
            <div className="mb-5 flex flex-col gap-2 border-t border-border-strong pt-5 lg:flex-row lg:items-baseline lg:justify-between">
              <code className="font-mono text-sm text-primary">{"<ConnectScene />"}</code>

              <span className="text-meta">The connect moment. Accent on the resolved state.</span>
            </div>

            <ConnectScene />
          </div>
        </div>
      </MarketingSection>

      <MarketingSection
        description="Every scene is composed from the same primitives, so a new one inherits the look instead of re-deriving it. What stays free is the composition, the state being told, and the words."
        title="How a new scene gets made"
      >
        <div className="mx-auto mt-14 max-w-3xl lg:mt-16">
          <ol className="flex flex-col gap-4">
            {[
              "Pick the one product state the picture is about, and verify the product reaches it.",
              "Compose from the grammar: SceneFrame for ground and crop, SceneWindow for chrome, then the rows or bubbles the state needs.",
              "Place exactly one accent, on the payoff.",
              "Check it in both themes. The tokens do this for you if nothing was hardcoded.",
              "If it moves, write a beat map and let the convention test check the rate and the hold.",
            ].map((step, index) => (
              <li key={step} className="flex gap-4 rounded-card border border-border bg-card px-6 py-4">
                <code className="font-mono text-sm text-primary">{String(index + 1).padStart(2, "0")}</code>

                <span className="text-sm leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>

          <pre className="mt-8 overflow-x-auto rounded-card border border-border bg-card p-5 text-xs leading-relaxed">
            <code className="font-mono">{`import { SceneFrame, SceneRow, SceneWindow, type SceneProps } from "./scene-grammar";

export function QueueClearedScene({ className, label }: SceneProps) {
  return (
    <SceneFrame className={className} crop="bottom" label={label}>
      <SceneWindow title="Tasks">
        <div className="flex size-full flex-col gap-3 p-7">
          <SceneRow>Follow up with Feldmann</SceneRow>
          <SceneRow accent>Cleared by the agent</SceneRow>
        </div>
      </SceneWindow>
    </SceneFrame>
  );
}`}</code>
          </pre>

          <p className="text-meta mt-5">
            Ground, crop, chrome, radius and ink are not written here. That is the point: they cannot drift.
          </p>
        </div>

        <div className="mt-16 overflow-hidden rounded-card border border-border bg-card">
          <div className="text-eyebrow border-b border-border px-6 py-3.5">What a scene may not do</div>

          <ul className="divide-y divide-border">
            {DONTS.map((entry) => (
              <li key={entry.dont} className="flex flex-col gap-1 px-6 py-4 md:flex-row md:items-baseline md:gap-6">
                <span className="w-72 shrink-0 text-sm font-medium">{entry.dont}</span>

                <span className="text-sm text-muted-foreground">{entry.why}</span>
              </li>
            ))}
          </ul>
        </div>
      </MarketingSection>

      <MarketingSection
        description="The same component as the static scene above, handed a clock. Nothing about the composition changes; only time is added."
        id="motion"
        title="Standard two — the living scene"
      >
        <div className="mt-14 lg:mt-16">
          <LivingChatDraft />
        </div>

        <div className="marketing-grid mt-14 gap-y-4">
          {LIVING_RULES.map((rule, index) => (
            <div
              key={rule}
              className="col-span-12 rounded-card border border-border bg-card p-6 md:col-span-6 lg:col-span-4"
            >
              <code className="font-mono text-sm text-primary">{String(index + 1).padStart(2, "0")}</code>

              <p className="mt-3 text-sm leading-relaxed">{rule}</p>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-14 max-w-3xl overflow-hidden rounded-card border border-border bg-card">
          <div className="text-eyebrow border-b border-border px-6 py-3.5">The beat map, measured</div>

          <ul className="divide-y divide-border">
            {[
              { note: "the customer's message lands", value: "0.02 to 0.10" },
              { note: "the draft types in at 23.9 characters a second", value: "0.14 to 0.46" },
              { note: "the draft waits, held for 3740ms", value: "0.46 to 0.80" },
              { note: "a human sends it", value: "0.80 to 1.00" },
            ].map((row) => (
              <li key={row.value} className="flex flex-wrap items-baseline gap-x-5 gap-y-1 px-6 py-3.5">
                <code className="text-meta w-32 shrink-0 font-mono">{row.value}</code>

                <span className="text-sm text-muted-foreground">{row.note}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-meta mx-auto mt-6 max-w-3xl text-center">
          Both figures are checked by a convention test, not by eye. A scene that types faster than 32 characters a
          second or holds its result for under 1.2 seconds fails the build.
        </p>
      </MarketingSection>

      <MarketingSection
        description="The same scene again, captured frame by frame instead of played. Because the scene is a pure function of its clock, the same command produces the same file every time."
        title="Standard three — the quick video"
      >
        <div className="mt-14 overflow-hidden rounded-card border border-border bg-card p-2 lg:mt-16">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="aspect-hero block w-full rounded-lg"
            preload="metadata"
            src="/scenes/chat-draft.mp4"
          />
        </div>

        <p className="text-meta mt-4">
          Eleven seconds, 1920 by 1080, silent, 179 KB. Rendered from the scene above rather than recorded.
        </p>

        <div className="marketing-grid mt-14 gap-y-4">
          {VIDEO_RULES.map((rule, index) => (
            <div
              key={rule}
              className="col-span-12 rounded-card border border-border bg-card p-6 md:col-span-6 lg:col-span-4"
            >
              <code className="font-mono text-sm text-primary">{String(index + 1).padStart(2, "0")}</code>

              <p className="mt-3 text-sm leading-relaxed">{rule}</p>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-14 max-w-3xl">
          <p className="text-lede text-center">
            Reproducing it is a command, not a memory. The determinism flag captures the whole clip twice and compares
            every frame, so a claim that it re-renders identically is checked rather than asserted.
          </p>

          <pre className="mt-6 overflow-x-auto rounded-card border border-border bg-card p-5 text-xs leading-relaxed">
            <code className="font-mono">{`yarn dev
node scripts/capture-scene-video.mjs --verify`}</code>
          </pre>

          <p className="text-meta mt-5">
            The capture clips to the scene itself. Capturing the whole viewport pulled the footer marquee into the
            frames and two passes disagreed, which is how that flag earned its place.
          </p>
        </div>
      </MarketingSection>
    </>
  );
}
