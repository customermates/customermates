export function invalidWikiSynthesisEvidencePaths(
  pages: readonly {
    sourceIds: readonly string[];
    sections: readonly { evidence: readonly { sourceId: string; quote: string }[] }[];
  }[],
  sources: ReadonlyMap<string, { text: string }>,
): (string | number)[][] {
  const paths: (string | number)[][] = [];
  for (const [pageIndex, page] of pages.entries()) {
    for (const [sectionIndex, section] of page.sections.entries()) {
      for (const [evidenceIndex, evidence] of section.evidence.entries()) {
        const source = sources.get(evidence.sourceId);
        if (
          !page.sourceIds.includes(evidence.sourceId) ||
          !source?.text.includes(evidence.quote) ||
          (evidence.quote.length < 20 && source.text.trim() !== evidence.quote)
        )
          paths.push(["pages", pageIndex, "sections", sectionIndex, "evidence", evidenceIndex]);
      }
    }
  }
  return paths;
}
