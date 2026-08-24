import { statSync } from "node:fs";
import { join } from "node:path";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { AgentOperatesCrm } from "@/components/marketing/schematics/brand-schematic";
import { PipelineScene } from "@/components/marketing/scenes/pipeline-scene";
import { RecordScene } from "@/components/marketing/scenes/record-scene";
import { AppVideo } from "@/components/shared/app-video";

const FRAME_RULES = [
  "The window is inset in the canvas and cropped so it runs off one edge. Every reference film does this, and a window that fills the frame reads as a screenshot rather than a picture of one.",
  "One ambient ground behind it, a single radial accent glow. It is the only gradient the system allows, and it is what makes a still read as a poster.",
  "Radius, spacing and type are the platform's own scale, doubled by one factor. Nothing in a depiction is rounder or looser than the application allows.",
];

const CONTENT_RULES = [
  "Fewer records than the real screen. A card carries a name and one number, not the whole row the product's own table shows.",
  "Exactly one loud object, and it is the thing the journey is about. If every element has the same weight the viewer has nowhere to look.",
  "The components are the application's own. Abstraction is scope and density; it is never the shape of a button.",
];

const MOTION_RULES = [
  "One journey, twelve seconds, twenty-four frames a second, silent, looping with no cut.",
  "The last frame renders what the first frame renders. Closure is authored, and a convention test compares the two.",
  "No adjacent pair of frames may drop below 0.95 similarity. A loop can close perfectly and still cut in the middle; one shipped that way.",
  "A cursor is the actor. It reaches, presses and drags, and it never appears in a still.",
];

function filmKilobytes(name: string): string {
  const weights = (["dark", "light"] as const).map((theme) =>
    Math.round(statSync(join(process.cwd(), "public", "scenes", theme, `${name}.mp4`)).size / 1024),
  );

  return `${weights[0]} and ${weights[1]} KB`;
}

function RuleList({ rules }: { rules: readonly string[] }) {
  return (
    <div className="marketing-grid mt-10 gap-y-4">
      {rules.map((rule, index) => (
        <div
          key={rule}
          className="col-span-12 rounded-card border border-border bg-card p-6 md:col-span-6 lg:col-span-4"
        >
          <code className="font-mono text-sm text-primary">{String(index + 1).padStart(2, "0")}</code>

          <p className="mt-3 text-sm leading-relaxed">{rule}</p>
        </div>
      ))}
    </div>
  );
}

function Caption({ name, note }: { name: string; note: string }) {
  return (
    <div className="mb-5 flex flex-col gap-1 border-t border-border-strong pt-5 lg:flex-row lg:items-baseline lg:justify-between lg:gap-8">
      <code className="font-mono text-sm text-primary">{`<${name} />`}</code>

      <span className="text-meta">{note}</span>
    </div>
  );
}

export function VisualStandards() {
  return (
    <>
      <MarketingSection
        description="Three examples, once each, in the theme you are reading. Everything a public page shows is one of these, and the rules under each are what produced it."
        id="standards"
        title="How a visual is made"
      >
        <div className="mt-14 lg:mt-16">
          <Caption name="RecordScene" note="A still. One product state, frozen at its resolved frame." />

          <RecordScene label="A deal record with its value and stage" />
        </div>

        <RuleList rules={FRAME_RULES} />

        <div className="mt-20">
          <Caption name="PipelineScene" note="The same grammar holding a moment rather than a state." />

          <PipelineScene label="A deal being carried from one stage to the next" />
        </div>

        <RuleList rules={CONTENT_RULES} />
      </MarketingSection>

      <MarketingSection
        description="A film is that still, stepped frame by frame and captured. A public page embeds the file rather than the animation; the live version stays here as the engine documenting itself."
        id="motion"
        title="The film"
      >
        <div className="mt-14 overflow-hidden rounded-card border border-border bg-card p-2 lg:mt-16">
          <AppVideo
            className="block w-full rounded-lg"
            height={920}
            label="A deal being carried from one stage to the next"
            name="pipeline"
            width={1280}
          />
        </div>

        <p className="text-meta mt-4">
          {`pipeline: ${filmKilobytes("pipeline")}. Twelve seconds, 1280 by 920, no audio track.`}
        </p>

        <RuleList rules={MOTION_RULES} />

        <div className="mx-auto mt-14 max-w-3xl">
          <p className="text-lede text-center">
            Reproducing a film is a command, not a memory. Three gates run on every capture and each holds the file back
            rather than reporting on it afterwards, so a film that fails one is never written.
          </p>

          <pre className="mt-6 overflow-x-auto rounded-card border border-border bg-card p-5 text-xs leading-relaxed">
            <code className="font-mono">{`yarn dev
node scripts/capture-scene-video.mjs --scene pipeline --theme dark --verify`}</code>
          </pre>
        </div>
      </MarketingSection>

      <MarketingSection
        description="For a capability that has no screen, because the surface belongs to another platform or the work happens in the background. Real components are the nodes, so the flow stays abstract without the pieces going vague."
        title="The schematic"
      >
        <div className="mt-14 lg:mt-16">
          <Caption
            name="AgentOperatesCrm"
            note="Every node names something in the code; the count comes from the registry."
          />

          <AgentOperatesCrm label="An AI client operating the CRM over MCP" />
        </div>

        <p className="text-meta mx-auto mt-8 max-w-3xl text-center">
          A schematic is the easiest place in the system to state something untrue, because it depicts a system rather
          than a screen and cannot be checked against the product by looking. Every edge has to be a real call path.
        </p>
      </MarketingSection>
    </>
  );
}
