import type { WikiSourceRecord } from "./wiki-website-crawl.service";

const PASSAGE_MAX_CHARACTERS = 480;
const SOURCE_MAX_PASSAGES = 3;

export function wikiSourcePlanningPassages(sources: Pick<WikiSourceRecord, "id" | "text">[]): Map<string, string[]> {
  const candidates = sources.map((source) => {
    const passages = [
      ...source.text.matchAll(/^(?![ \t]*#{1,6}\s)[^\n]+(?:\n(?!\n|[ \t]*#{1,6}\s)[^\n]+)*/gmu),
    ].flatMap((match) => {
      const paragraph = match[0].trim();
      if (
        paragraph.length < 20 ||
        /^#{1,6}\s/u.test(paragraph) ||
        /^https?:\/\/\S+$/u.test(paragraph) ||
        /^\[[^\]]+\]\([^)]*\)$/u.test(paragraph) ||
        !/\p{L}/u.test(paragraph)
      )
        return [];
      let text = paragraph.slice(0, PASSAGE_MAX_CHARACTERS);
      if (text.length < paragraph.length) {
        const boundary = text.lastIndexOf(" ");
        if (boundary >= PASSAGE_MAX_CHARACTERS / 2) text = text.slice(0, boundary);
        else if (/[\uD800-\uDBFF]$/u.test(text)) text = text.slice(0, -1);
      }
      text = text.trimEnd();
      if (text.length < 20) return [];
      return [text];
    });
    return { id: source.id, passages };
  });
  const key = (text: string) => text.toLowerCase().replace(/\s+/gu, " ");
  const frequency = new Map<string, number>();
  for (const { passages } of candidates)
    for (const value of new Set(passages.map(key))) frequency.set(value, (frequency.get(value) ?? 0) + 1);

  return new Map(
    candidates.map(({ id, passages }): [string, string[]] => {
      const unique = new Map<string, string>();
      for (const passage of passages) if (!unique.has(key(passage))) unique.set(key(passage), passage);
      return [
        id,
        [...unique.values()]
          .sort((left, right) => (frequency.get(key(left)) ?? 0) - (frequency.get(key(right)) ?? 0))
          .slice(0, SOURCE_MAX_PASSAGES),
      ];
    }),
  );
}
