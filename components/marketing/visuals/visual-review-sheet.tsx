import type { BrandIllustrationBrief, VisualLocale, VisualPlacement } from "./visual-contract";

import { getGoldenVisualBrief, type GoldenVisualBrief } from "./goldens";
import { GoldenStoryVisual, type GoldenStoryVisualTheme } from "./story-visual";
import { VISUAL_PLACEMENTS } from "./visual-contract";
import { assetLocaleFor, contentLocaleOrDefault } from "@/i18n/locale-registry";

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
  es: {
    briefNote:
      "Este brief puede crear su propia composición. El golden registrado del recorrido que aparece abajo define el nivel mínimo de calidad, no la geometría del nuevo visual.",
    goldenBenchmark: "golden de referencia registrado",
    goldenNote:
      "Este golden de referencia calibra la jerarquía, la densidad y el comportamiento adaptable. Es una referencia de calidad, no una plantilla de composición para nuevos visuales.",
    pathway: "recorrido",
    pathwayGuidance:
      "Compara la jerarquía focal, el detalle nativo, la disciplina de las afirmaciones y la recomposición adaptable. No copies la geometría de la referencia salvo que la nueva historia la justifique por sí sola.",
    pathwayHeading: "Referencia del recorrido",
  },
  pt: {
    briefNote:
      "Este brief tem liberdade para criar a própria composição. O golden registrado do caminho abaixo define o padrão mínimo de qualidade, não a geometria do novo visual.",
    goldenBenchmark: "golden de referência registrado",
    goldenNote:
      "Este golden de referência calibra hierarquia, densidade e comportamento responsivo. É uma referência de qualidade, não um modelo de composição para novos visuais.",
    pathway: "caminho",
    pathwayGuidance:
      "Compare a hierarquia focal, o detalhe nativo, a disciplina das afirmações e a recomposição responsiva. Não copie a geometria da referência, a menos que a nova história a justifique por conta própria.",
    pathwayHeading: "Referência do caminho",
  },
  pl: {
    briefNote:
      "Ten brief może mieć własną kompozycję. Zarejestrowany golden ścieżki poniżej wyznacza dolną granicę jakości, a nie geometrię nowej wizualizacji.",
    goldenBenchmark: "zarejestrowany golden wzorcowy",
    goldenNote:
      "Ten golden wzorcowy kalibruje hierarchię, gęstość i zachowanie responsywne. To wzorzec jakości, a nie szablon kompozycji dla nowych wizualizacji.",
    pathway: "ścieżka",
    pathwayGuidance:
      "Porównaj hierarchię ogniskową, natywne szczegóły, rzetelność twierdzeń i responsywną rekompozycję. Nie kopiuj geometrii wzorca, chyba że nowa historia sama ją uzasadnia.",
    pathwayHeading: "Wzorzec ścieżki",
  },
  nl: {
    briefNote:
      "Deze brief mag een eigen compositie krijgen. De geregistreerde golden van het onderstaande pad bepaalt de kwaliteitsondergrens, niet de geometrie van de nieuwe visual.",
    goldenBenchmark: "geregistreerde golden benchmark",
    goldenNote:
      "Deze golden benchmark kalibreert hiërarchie, dichtheid en responsief gedrag. Het is een kwaliteitsreferentie, geen compositiesjabloon voor nieuwe visuals.",
    pathway: "pad",
    pathwayGuidance:
      "Vergelijk de focale hiërarchie, native details, claimdiscipline en responsieve hercompositie. Kopieer de geometrie van de benchmark alleen als het nieuwe verhaal die zelfstandig rechtvaardigt.",
    pathwayHeading: "Padbenchmark",
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
      <p className="font-terminal text-sm text-foreground">{eyebrow}</p>

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
  const copy = REVIEW_COPY[assetLocaleFor(contentLocaleOrDefault(brief.locale))];

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
  const reviewLocale = assetLocaleFor(contentLocaleOrDefault(brief.locale));
  const benchmark = getGoldenVisualBrief(brief.pathway, reviewLocale);
  const copy = REVIEW_COPY[reviewLocale];

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
