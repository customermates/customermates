import type { BrandIllustrationBrief, VisualPlacement, VisualVariant } from "./visual-contract";
import { VISUAL_PLACEMENTS, VISUAL_VARIANTS } from "./visual-contract";
import { StoryVisual, type StoryVisualTheme } from "./story-visual";

export const VISUAL_CANDIDATES = [
  { id: "A", variant: "edge" },
  { id: "B", variant: "overlap" },
  { id: "C", variant: "stage" },
] as const satisfies readonly { id: string; variant: VisualVariant }[];

const REVIEW_PLACEMENT_LAYOUTS: Record<VisualPlacement, string> = {
  wide: "grid gap-4",
  split: "grid max-w-[87rem] gap-4 lg:grid-cols-2",
  narrow: "grid max-w-[50rem] gap-4 sm:grid-cols-2",
};

function candidateTitle(index: number, variant: VisualVariant, selected = false) {
  return `${VISUAL_CANDIDATES[index].id} · ${variant}${selected ? " · selected" : ""}`;
}

export function GoldenCandidateTriptych({
  brief,
  placement = "wide",
  themes = ["light", "dark"],
}: {
  brief: BrandIllustrationBrief;
  placement?: VisualPlacement;
  themes?: StoryVisualTheme[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {VISUAL_CANDIDATES.map((candidate) => (
        <figure
          key={candidate.id}
          className="m-0 min-w-0"
          data-selected-candidate={candidate.variant === brief.selectedVariant ? "true" : undefined}
        >
          <figcaption className="flex items-baseline justify-between gap-3 pb-3">
            <span className="font-mono text-sm text-primary">{candidate.id}</span>

            <span className="text-meta capitalize">
              {`${candidate.variant}${candidate.variant === brief.selectedVariant ? " · selected" : ""}`}
            </span>
          </figcaption>

          <div className="space-y-2">
            {themes.map((theme) => (
              <StoryVisual key={theme} brief={brief} placement={placement} theme={theme} variant={candidate.variant} />
            ))}
          </div>
        </figure>
      ))}
    </div>
  );
}

export function VisualReviewSheet({ brief }: { brief: BrandIllustrationBrief }) {
  const provenance = `${brief.source.checksum} · ${brief.referenceSystemVersion}`;

  return (
    <main className="mx-auto max-w-marketing bg-background p-8 text-foreground">
      <header className="mb-12 max-w-3xl">
        <p className="font-mono text-sm text-primary">{brief.id}</p>

        <h1 className="mt-4 text-4xl font-semibold tracking-tight">{brief.takeaway}</h1>

        <p className="mt-4 text-sm text-muted-foreground">{provenance}</p>
      </header>

      <div className="space-y-16">
        {VISUAL_PLACEMENTS.map((placement) => (
          <section key={placement}>
            <h2 className="mb-5 text-xl font-medium capitalize">{placement}</h2>

            <div className="space-y-10">
              {VISUAL_VARIANTS.map((variant, index) => (
                <article key={variant}>
                  <h3 className="mb-3 font-mono text-sm text-muted-foreground">
                    {candidateTitle(index, variant, variant === brief.selectedVariant)}
                  </h3>

                  <div className={REVIEW_PLACEMENT_LAYOUTS[placement]} data-review-placement={placement}>
                    <StoryVisual brief={brief} placement={placement} theme="light" variant={variant} />

                    <StoryVisual brief={brief} placement={placement} theme="dark" variant={variant} />
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
