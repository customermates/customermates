import type { BrandIllustrationBrief, VisualLocale, VisualPlacement } from "./visual-contract";

import { getGoldenVisualBrief, type GoldenVisualBrief } from "./goldens";
import { GoldenStoryVisual, type GoldenStoryVisualTheme } from "./story-visual";
import { VISUAL_PLACEMENTS } from "./visual-contract";

const REVIEW_PLACEMENT_LAYOUTS: Record<VisualPlacement, string> = {
  wide: "grid gap-4",
  split: "grid max-w-[87rem] gap-4 lg:grid-cols-2",
  narrow: "grid max-w-[50rem] gap-4 sm:grid-cols-2",
};

const REVIEW_COPY = {
  de: {
    briefNote:
      "Diese Beschreibung kann ihre eigene Komposition erhalten. Der registrierte Golden-Benchmark des Pfads unten definiert die Qualitätsgrenze, nicht die Geometrie der neuen Visualisierung.",
    goldenBenchmark: "Registrierter Golden-Benchmark",
    goldenNote:
      "Dieser Golden-Benchmark kalibriert Hierarchie, Dichte und responsives Verhalten. Er ist eine Qualitätsreferenz und keine Kompositionsvorlage für neue Visualisierungen.",
    pathway: "Visualpfad",
    pathwayGuidance:
      "Vergleiche visuelle Hierarchie, native Details, Claim-Disziplin und responsive Rekomposition. Übernimm die Geometrie des Benchmarks nur, wenn die neue Geschichte sie eigenständig rechtfertigt.",
    pathwayHeading: "Pfad-Benchmark",
  },
  en: {
    briefNote:
      "This brief is free to author its own composition. The registered pathway golden below defines the quality floor, not the geometry of the new visual.",
    goldenBenchmark: "registered golden benchmark",
    goldenNote:
      "This golden benchmark calibrates hierarchy, density and responsive behavior. It is a quality reference, not a composition template for new visuals.",
    pathway: "pathway",
    pathwayGuidance:
      "Compare focal hierarchy, native detail, claim discipline and responsive recomposition. Do not copy the benchmark geometry unless the new story independently earns it.",
    pathwayHeading: "Pathway benchmark",
  },
} as const satisfies Record<
  VisualLocale,
  {
    briefNote: string;
    goldenBenchmark: string;
    goldenNote: string;
    pathway: string;
    pathwayGuidance: string;
    pathwayHeading: string;
  }
>;

function ReviewHeader({ brief, eyebrow, note }: { brief: BrandIllustrationBrief; eyebrow: string; note: string }) {
  const provenance = `${brief.source.checksum} · ${brief.referenceSystemVersion}`;

  return (
    <header className="mb-12 max-w-3xl">
      <p className="font-mono text-sm text-primary">{eyebrow}</p>

      <h1 className="mt-4 text-4xl font-semibold tracking-tight">{brief.takeaway}</h1>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{note}</p>

      <p className="mt-4 text-sm text-muted-foreground">{provenance}</p>
    </header>
  );
}

function GoldenThemePair({
  brief,
  placement,
  themes = ["light", "dark"],
}: {
  brief: GoldenVisualBrief;
  placement: VisualPlacement;
  themes?: GoldenStoryVisualTheme[];
}) {
  return (
    <div className={REVIEW_PLACEMENT_LAYOUTS[placement]} data-review-placement={placement}>
      {themes.map((theme) => (
        <GoldenStoryVisual key={theme} brief={brief} placement={placement} theme={theme} />
      ))}
    </div>
  );
}

export function GoldenBenchmarkReviewSheet({ brief }: { brief: GoldenVisualBrief }) {
  const copy = REVIEW_COPY[brief.locale];

  return (
    <main className="mx-auto max-w-marketing bg-background p-8 text-foreground">
      <ReviewHeader brief={brief} eyebrow={`${brief.id} · ${copy.goldenBenchmark}`} note={copy.goldenNote} />

      <div className="space-y-16">
        {VISUAL_PLACEMENTS.map((placement) => (
          <section key={placement}>
            <h2 className="mb-5 text-xl font-medium capitalize">{placement}</h2>

            <GoldenThemePair brief={brief} placement={placement} />
          </section>
        ))}
      </div>
    </main>
  );
}

export function VisualBriefReferenceSheet({ brief }: { brief: BrandIllustrationBrief }) {
  const benchmark = getGoldenVisualBrief(brief.pathway, brief.locale);
  const copy = REVIEW_COPY[brief.locale];

  return (
    <main className="mx-auto max-w-marketing bg-background p-8 text-foreground">
      <ReviewHeader brief={brief} eyebrow={`${brief.id} · ${brief.pathway} ${copy.pathway}`} note={copy.briefNote} />

      <section>
        <h2 className="mb-3 text-xl font-medium">{copy.pathwayHeading}</h2>

        <p className="mb-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">{copy.pathwayGuidance}</p>

        <GoldenThemePair brief={benchmark} placement="wide" />
      </section>
    </main>
  );
}
