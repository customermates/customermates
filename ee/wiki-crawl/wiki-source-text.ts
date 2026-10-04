import type { WikiSourceQa } from "./website-source-extract";

import { WIKI_SOURCE_MAX_CHARACTERS } from "./website-source-extract";

const FAQ_MAX_CHARACTERS = Math.floor(WIKI_SOURCE_MAX_CHARACTERS / 3);
const regexLiteral = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

export function wikiSourceMissingFaqs(source: { text: string; qaPairs: readonly WikiSourceQa[] }): WikiSourceQa[] {
  return source.qaPairs.filter(
    ({ question, answer }) => !source.text.includes(question) || !source.text.includes(answer),
  );
}

export function wikiSourceText(source: { text: string; qaPairs: readonly WikiSourceQa[] }): string {
  const selected: WikiSourceQa[] = [];
  const blocks: string[] = [];
  let length = 0;
  for (const pair of source.qaPairs) {
    const block = `## ${pair.question}\n\n${pair.answer}`;
    const size = block.length + (blocks.length ? 2 : 0);
    if (length + size > FAQ_MAX_CHARACTERS) break;
    selected.push(pair);
    blocks.push(block);
    length += size;
  }
  const bodyText = selected
    .reduce(
      (text, { question, answer }) =>
        text.replace(
          new RegExp(`(^|\\n)#{1,6} ${regexLiteral(question)}\\n+${regexLiteral(answer)}(?=\\n|$)`, "gu"),
          "$1",
        ),
      source.text,
    )
    .replace(/\n{3,}/gu, "\n\n")
    .trimEnd();
  const body = bodyText.slice(0, Math.max(0, WIKI_SOURCE_MAX_CHARACTERS - length - (blocks.length ? 2 : 0))).trimEnd();
  return [body, ...blocks].filter(Boolean).join("\n\n");
}
