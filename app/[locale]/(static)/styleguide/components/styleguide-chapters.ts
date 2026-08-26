export type StyleguideChapterId = "overview" | "foundations" | "patterns" | "visuals";

export type StyleguideSection = {
  id: string;
  label: string;
};

export type StyleguideChapter = {
  description: string;
  href: string;
  id: StyleguideChapterId;
  label: string;
  sections: readonly StyleguideSection[];
  title: string;
};

export const STYLEGUIDE_CHAPTERS = [
  {
    description:
      "Start with the message, decide whether it earns a visual, and move into the chapter that owns the decision.",
    href: "/styleguide",
    id: "overview",
    label: "Overview",
    sections: [
      { id: "orientation", label: "How to use the guide" },
      { id: "decision-tree", label: "Visual decision tree" },
      { id: "chapter-map", label: "Chapter map" },
    ],
    title: "Marketing visual system",
  },
  {
    description: "The tokens, type, geometry and responsive constraints shared by every public marketing surface.",
    href: "/styleguide/foundations",
    id: "foundations",
    label: "Foundations",
    sections: [
      { id: "surfaces", label: "Surfaces" },
      { id: "edges-washes", label: "Edges and washes" },
      { id: "signals", label: "Accent and signal" },
      { id: "typography", label: "Typography" },
      { id: "geometry", label: "Geometry" },
      { id: "responsive", label: "Responsive rules" },
      { id: "prohibitions", label: "Global prohibitions" },
    ],
    title: "Foundations",
  },
  {
    description:
      "Eleven reusable section shapes, shown without artwork so their structure and collapse behaviour stay legible.",
    href: "/styleguide/patterns",
    id: "patterns",
    label: "Patterns",
    sections: [
      { id: "S-01", label: "S-01 Feature pair" },
      { id: "S-02", label: "S-02 Capability grid" },
      { id: "S-03", label: "S-03 Split, media trailing" },
      { id: "S-04", label: "S-04 Split, media leading" },
      { id: "S-05", label: "S-05 Metric row" },
      { id: "S-06", label: "S-06 Two-column verdict" },
      { id: "S-07", label: "S-07 Channel strip" },
      { id: "S-08", label: "S-08 Numbered sequence" },
      { id: "S-09", label: "S-09 Pull quote" },
      { id: "S-10", label: "S-10 Product proof" },
      { id: "S-11", label: "S-11 Closing panel" },
    ],
    title: "Section patterns",
  },
  {
    description:
      "The authenticity families, validated brief contract, semantic pathways and calibrated golden benchmarks.",
    href: "/styleguide/visuals",
    id: "visuals",
    label: "Visuals",
    sections: [
      { id: "families", label: "Authenticity families" },
      { id: "machine-contract", label: "Machine contract" },
      { id: "goldens", label: "Semantic goldens" },
      { id: "responsive-benchmark", label: "Responsive benchmark" },
      { id: "failures", label: "Failure examples" },
    ],
    title: "Visuals",
  },
] as const satisfies readonly StyleguideChapter[];

export function getStyleguideChapter(id: StyleguideChapterId): StyleguideChapter {
  const chapter = STYLEGUIDE_CHAPTERS.find((entry) => entry.id === id);

  if (!chapter) throw new Error(`Unknown style guide chapter: ${id}`);

  return chapter;
}
