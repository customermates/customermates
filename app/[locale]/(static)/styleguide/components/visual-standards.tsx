import { statSync } from "node:fs";
import { join } from "node:path";

import { ThemePair } from "./theme-pair";

import { AppVideo } from "@/components/shared/app-video";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { ChatDraftScene } from "@/components/marketing/scenes/chat-draft-scene";
import { ConnectScene } from "@/components/marketing/scenes/connect-scene";
import { DashboardScene } from "@/components/marketing/scenes/dashboard-scene";
import { PipelineScene } from "@/components/marketing/scenes/pipeline-scene";
import { LivingChatDraft } from "@/components/marketing/scenes/living-chat-draft";
import { LivingDashboard } from "@/components/marketing/scenes/living-dashboard";
import { LivingPipeline } from "@/components/marketing/scenes/living-pipeline";
import { RecordScene } from "@/components/marketing/scenes/record-scene";

const ROUTING = [
  {
    need: "Prove it really works",
    pick: "Product proof",
    why: "a capture is evidence, and only a capture is",
  },
  { need: "Explain one thing the product does", pick: "Scene", why: "a drawing, reduced to the point" },
  { need: "Show an order or a flow", pick: "Schematic", why: "nodes and edges carry sequence, prose blurs it" },
  { need: "Carry a section with no subject", pick: "Brand illustration", why: "abstract, and cheap to place" },
  { need: "Make a link unfurl well", pick: "Social card", why: "someone else's interface, so it is always dark" },
];

const INTAKE = [
  "Which class. The table above answers it, and the answer decides everything after.",
  "Which product state. Name it, then check the product actually reaches it.",
  "What the accent marks. Exactly one thing in the frame is the payoff.",
];

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
  "At t = 1 the scene renders exactly what it renders at t = 0. Anything that only appears once is an entrance, and an entrance pops on every loop.",
  "One primary motion at a time. Two things moving for the same reason is one thing too many.",
  "A cursor may reach, press and drag. It never appears in a still, because a still has nobody in it.",
  "The clock stops when the scene scrolls out of view and when the tab is hidden.",
  "Reduced motion renders the resolved frame as a still and never starts the clock at all.",
];

const VIDEO_RULES = [
  "Window-shaped, not cinema-shaped. 1280 by 920, because the subject is an interface rather than a scene, and the window fills the canvas edge to edge with no ground behind it.",
  "Twelve seconds at 24 frames a second. One journey, from a resolved home state and back to it, with no cuts.",
  "The last frame is the first frame. Closure is authored, never crossfaded: the draft un-types itself, the carried card is carried back.",
  "A cursor is the actor. It reaches, presses and drags, and what it lifts follows it and casts the one shadow the grammar allows.",
  "Silent, with no audio track at all, and never over a megabyte.",
  "Shipped as a light file and a dark file, because an MP4 cannot follow a CSS theme.",
];

const FILMS = [
  { journey: "a deal is carried from one stage to the next", name: "pipeline" },
  { journey: "a draft is written for a human, and a human sends it", name: "chat-draft" },
  { journey: "a week of stored numbers is read off a chart", name: "dashboard" },
];

function filmKilobytes(name: string): string {
  const weights = (["dark", "light"] as const).map((theme) =>
    Math.round(statSync(join(process.cwd(), "public", "scenes", theme, `${name}.mp4`)).size / 1024),
  );

  return `${weights[0]} and ${weights[1]} KB`;
}

const REFERENCE_DECODE = [
  { measured: "1280 by 920 and 1280 by 900", ours: "1280 by 920", what: "Canvas" },
  { measured: "24 and 30", ours: "24", what: "Frames a second" },
  { measured: "5 to 12 seconds", ours: "12 seconds", what: "Length" },
  { measured: "none, or a silent audio track", ours: "no audio track at all", what: "Audio" },
  { measured: "368 KB to 1.1 MB", ours: "under 160 KB", what: "Weight" },
  { measured: "0.87 to 0.9999", ours: "0.9995 and better", what: "First frame against last" },
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
        description="Start here. The first question is never how to draw something, it is which kind of picture the need calls for, because that decides the tool, the rules and whether the result is evidence or a drawing."
        id="standards"
        title="Which picture does this need"
      >
        <div className="mx-auto mt-14 max-w-4xl overflow-hidden rounded-card border border-border bg-card lg:mt-16">
          <ul className="divide-y divide-border">
            {ROUTING.map((row) => (
              <li key={row.pick} className="flex flex-col gap-1 px-6 py-4 md:flex-row md:items-baseline md:gap-6">
                <span className="w-72 shrink-0 text-sm">{row.need}</span>

                <span className="w-48 shrink-0 text-sm font-medium text-primary">{row.pick}</span>

                <span className="text-sm text-muted-foreground">{row.why}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mx-auto mt-12 max-w-3xl">
          <p className="text-lede text-center">
            Then three facts settle the request. Without them an agent is guessing, and a guessed picture is where an
            untrue one comes from.
          </p>

          <ol className="mt-6 flex flex-col gap-3">
            {INTAKE.map((fact, index) => (
              <li key={fact} className="flex gap-4 rounded-card border border-border bg-card px-6 py-4">
                <code className="font-mono text-sm text-primary">{String(index + 1).padStart(2, "0")}</code>

                <span className="text-sm leading-relaxed">{fact}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mx-auto mt-12 max-w-3xl rounded-card border border-border-strong bg-card p-7">
          <h3 className="m-0 font-medium">A capture and a scene are not interchangeable</h3>

          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            A capture is a photograph of the running product: it is evidence, and it may be presented as what the
            product looks like. A scene is a drawing that uses the product&apos;s own tokens: it explains what the
            product does, and it may never be presented as a screenshot. The two look deliberately different so a reader
            can tell which they are looking at, and picking the wrong one turns an explanation into a claim.
          </p>
        </div>
      </MarketingSection>

      <MarketingSection
        description="Three things can be asked of an agent, and all three are the same scene at a different length of time. That is what keeps them consistent: one composition, frozen, driven, or captured."
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

            <ThemePair stacked>
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

          <div>
            <div className="mb-5 flex flex-col gap-2 border-t border-border-strong pt-5 lg:flex-row lg:items-baseline lg:justify-between">
              <code className="font-mono text-sm text-primary">{"<PipelineScene />"}</code>

              <span className="text-meta">Industry and pipeline pages. Accent on the deal that moved.</span>
            </div>

            <PipelineScene />
          </div>

          <div>
            <div className="mb-5 flex flex-col gap-2 border-t border-border-strong pt-5 lg:flex-row lg:items-baseline lg:justify-between">
              <code className="font-mono text-sm text-primary">{"<DashboardScene />"}</code>

              <span className="text-meta">Pricing and overview pages. Accent on what the agent did.</span>
            </div>

            <DashboardScene />
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
              "Pick the one product state the picture is about, then verify it: the fact sheet's does-not-exist list rules a capability out, and governance/product-claims.json holds every countable figure. A scene may not be the first place a claim appears.",
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

export function NoteAddedScene({ className, label }: SceneProps) {
  return (
    <SceneFrame className={className} crop="bottom" label={label}>
      <SceneWindow title="Contacts · Leon Becker">
        <div className="flex flex-col gap-[1.1cqw] p-[2.4cqw]">
          <SceneRow>Call summary from Tuesday</SceneRow>
          <SceneRow accent>Note written by the agent</SceneRow>
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

        <div className="marketing-grid mt-6 gap-y-6">
          <div className="col-span-12 lg:col-span-6">
            <LivingPipeline />
          </div>

          <div className="col-span-12 lg:col-span-6">
            <LivingDashboard />
          </div>
        </div>

        <p className="text-meta mt-5">
          Every scene takes the same clock, so any of them animates without being rewritten. The beat map below belongs
          to the chat scene, and the other two are read the same way.
        </p>

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
              { note: "the customer's message is already there, and stays there", value: "0.00 to 1.00" },
              { note: "the draft types in at 26.9 characters a second", value: "0.12 to 0.38" },
              { note: "the draft waits for a human, held for 3360ms", value: "0.38 to 0.66" },
              { note: "the cursor presses Send, and the state holds again", value: "0.66 to 0.82" },
              { note: "the draft un-types itself back to the first frame", value: "0.82 to 0.96" },
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
        description="The same scenes again, captured frame by frame instead of played. Public pages embed the file, not the animation: a marketing page ships MP4s, and a live JS animation exists only here, as the engine documenting itself."
        title="Standard three — the film"
      >
        <div className="marketing-grid mt-14 gap-y-10 lg:mt-16">
          {FILMS.map((film, index) => (
            <div key={film.name} className={index === 0 ? "col-span-12" : "col-span-12 lg:col-span-6"}>
              <div className="overflow-hidden rounded-card border border-border bg-card p-2">
                <AppVideo
                  className="block w-full rounded-lg"
                  height={920}
                  label={film.journey}
                  name={film.name}
                  width={1280}
                />
              </div>

              <p className="text-meta mt-4">
                <code className="font-mono text-primary">{film.name}</code>

                <span>{`: ${film.journey}. ${filmKilobytes(film.name)}.`}</span>
              </p>
            </div>
          ))}
        </div>

        <p className="text-lede mx-auto mt-12 max-w-3xl text-center">
          Each is twelve seconds at 24 frames a second, 1280 by 920, with no audio track. They follow the theme because
          each one is two files, and the component picks the one that matches.
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

        <div className="mx-auto mt-14 max-w-3xl overflow-hidden rounded-card border border-border bg-card">
          <div className="text-eyebrow border-b border-border px-6 py-3.5">
            Where the numbers came from, and where we landed
          </div>

          <ul className="divide-y divide-border">
            {REFERENCE_DECODE.map((row) => (
              <li key={row.what} className="flex flex-wrap items-baseline gap-x-5 gap-y-1 px-6 py-3.5">
                <span className="w-44 shrink-0 text-sm font-medium">{row.what}</span>

                <span className="text-meta w-52 shrink-0">{row.measured}</span>

                <code className="font-mono text-sm text-primary">{row.ours}</code>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-meta mx-auto mt-5 max-w-3xl">
          The middle column is what we measured on the films we took as reference; the right column is what this system
          ships. The only figure we deliberately beat rather than matched is the loop: theirs cut, ours does not.
        </p>

        <div className="mx-auto mt-14 max-w-3xl">
          <p className="text-lede text-center">
            Reproducing a film is a command, not a memory. Two gates run on every capture, and both hold the file back
            rather than reporting on it afterwards: a film that fails is never written.
          </p>

          <pre className="mt-6 overflow-x-auto rounded-card border border-border bg-card p-5 text-xs leading-relaxed">
            <code className="font-mono">{`yarn dev
node scripts/capture-scene-video.mjs --scene pipeline --theme dark
node scripts/capture-scene-video.mjs --scene pipeline --theme dark --verify`}</code>
          </pre>

          <p className="text-meta mt-5">
            The first gate is loop closure: the opening and closing frames are compared by SSIM and anything under 0.97
            fails. The second is weight, capped at a megabyte. The verify flag adds a third, capturing the whole film
            twice and comparing every frame, so determinism is checked rather than asserted.
          </p>

          <p className="text-meta mt-4">
            The capture clips to the scene and renders it in a viewport taller than the clip. Both details were bought:
            capturing the viewport pulled the footer marquee into the frames, and clipping to the exact viewport height
            returned the last 43 rows blank, which sliced the day labels off every frame of the dashboard film.
          </p>
        </div>
      </MarketingSection>
    </>
  );
}
