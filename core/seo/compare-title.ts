export function compareDisplayTitle(
  slug: string,
  competitorName: string,
  competitor2Name: string | undefined,
  alternativeTitle: (competitor: string) => string,
): string {
  if (slug.includes("-vs-") && competitor2Name) return `${competitorName} vs ${competitor2Name}`;
  if (slug.endsWith("-alternative")) return alternativeTitle(competitorName);

  return competitorName;
}
