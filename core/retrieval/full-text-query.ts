import { Prisma } from "@/generated/prisma";

export { textSearchConfigFor } from "@/i18n/locale-registry";

export const SUBSTRING_SEARCH_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const QUOTED_PHRASE = /["“”„«»]([^"“”„«»]*)["“”„«»]?/gu;
const QUERY_TOKEN = /[\p{L}\p{N}]+(?:[-_.'’][\p{L}\p{N}]+)*/gu;
const PREFIX_TOKEN = /^[\p{L}\p{N}]{2,}$/u;
const FULL_TEXT_MAX_UNITS = 32;
const FULL_TEXT_MAX_CANDIDATE_UNITS = 256;
const FULL_TEXT_MAX_TERM_LENGTH = 64;

export type FullTextUnit = { text: string; phrase: boolean; prefix: boolean; substring: boolean };

function boundedTerm(value: string): string {
  return Array.from(value).slice(0, FULL_TEXT_MAX_TERM_LENGTH).join("");
}

function substringSegments(term: string): string[] {
  const segmenter = new Intl.Segmenter("und", { granularity: "word" });
  const segments = [...segmenter.segment(term)]
    .filter(({ isWordLike }) => isWordLike)
    .map(({ segment }) => segment)
    .filter((segment) => segment !== term && SUBSTRING_SEARCH_SCRIPT.test(segment));
  return [term, ...segments];
}

export function fullTextUnits(query: string): FullTextUnit[] {
  const lowered = query.normalize("NFC").toLocaleLowerCase();
  const units: FullTextUnit[] = [];
  const seen = new Set<string>();
  const add = (unit: FullTextUnit) => {
    const key = `${unit.substring ? "s" : unit.phrase ? "p" : "w"}:${unit.text}`;
    if (!unit.text || seen.has(key) || units.length >= FULL_TEXT_MAX_CANDIDATE_UNITS) return;
    seen.add(key);
    units.push(unit);
  };
  const addToken = (token: string, prefix: boolean) => {
    if (SUBSTRING_SEARCH_SCRIPT.test(token)) {
      for (const segment of substringSegments(token))
        add({ text: segment, phrase: false, prefix: false, substring: true });
      return;
    }
    add({ text: token, phrase: false, prefix, substring: false });
  };

  let cursor = 0;
  const unquoted: string[] = [];
  for (const match of lowered.matchAll(QUOTED_PHRASE)) {
    unquoted.push(lowered.slice(cursor, match.index));
    cursor = (match.index ?? 0) + match[0].length;
    const words = (match[1].match(QUERY_TOKEN) ?? []).map(boundedTerm);
    if (words.length > 1 && !words.some((word) => SUBSTRING_SEARCH_SCRIPT.test(word)))
      add({ text: words.join(" "), phrase: true, prefix: false, substring: false });
    else for (const word of words) addToken(word, false);
  }
  unquoted.push(lowered.slice(cursor));
  const rest = unquoted.join(" ");
  const tokens = [...rest.matchAll(QUERY_TOKEN)].map((match) => boundedTerm(match[0]));
  const last = tokens.at(-1);
  const endsWithLast = last !== undefined && lowered.trimEnd().endsWith(last);
  tokens.forEach((token, index) =>
    addToken(token, endsWithLast && index === tokens.length - 1 && PREFIX_TOKEN.test(token)),
  );
  if (units.length <= FULL_TEXT_MAX_UNITS) return units;
  const kept = new Set(
    units
      .map((unit, index) => ({ index, length: Array.from(unit.text).length }))
      .sort((left, right) => right.length - left.length || left.index - right.index)
      .slice(0, FULL_TEXT_MAX_UNITS)
      .map(({ index }) => index),
  );
  return units.filter((_, index) => kept.has(index));
}

function unitQuery(unit: FullTextUnit, configs: readonly string[]): Prisma.Sql {
  const parts = configs.map((config) =>
    unit.phrase
      ? Prisma.sql`phraseto_tsquery(${config}::regconfig, ${unit.text})`
      : Prisma.sql`plainto_tsquery(${config}::regconfig, ${unit.text})`,
  );
  if (unit.prefix) parts.push(Prisma.sql`to_tsquery('simple', ${`'${unit.text}':*`})`);
  return Prisma.sql`(${Prisma.join(parts, " || ")})`;
}

function unitStop(unit: FullTextUnit, stopConfig: string): Prisma.Sql {
  return unit.phrase
    ? Prisma.sql`false`
    : Prisma.sql`numnode(plainto_tsquery(${stopConfig}::regconfig, ${unit.text})) = 0`;
}

export function fullTextUnitsCte(args: {
  units: readonly FullTextUnit[];
  configs: readonly string[];
  stopConfig: string;
}): Prisma.Sql {
  const words = args.units.flatMap((unit, index) => (unit.substring ? [] : [{ unit, ord: index + 1 }]));
  const raw =
    words.length > 0
      ? Prisma.sql`SELECT * FROM (VALUES ${Prisma.join(
          words.map(
            ({ unit, ord }) =>
              Prisma.sql`(${ord}::int, ${unitQuery(unit, ["simple", ...args.configs])}, ${unitStop(unit, args.stopConfig)})`,
          ),
        )}) AS v("ord", "query", "stop") WHERE numnode(v."query") > 0`
      : Prisma.sql`SELECT NULL::int AS "ord", NULL::tsquery AS "query", NULL::boolean AS "stop" WHERE false`;
  return Prisma.sql`
    "rawUnits" AS MATERIALIZED (${raw}),
    units AS MATERIALIZED (
      SELECT r."ord", r."query" FROM "rawUnits" r
      WHERE NOT r."stop" OR NOT EXISTS (SELECT 1 FROM "rawUnits" k WHERE NOT k."stop")
    ),
    "anyUnit" AS MATERIALIZED (
      SELECT string_agg('(' || u."query"::text || ')', ' | ')::tsquery AS "query" FROM units u
    )`;
}

export function substringUnits(units: readonly FullTextUnit[]): Array<{ ord: number; text: string }> {
  return units.flatMap((unit, index) => (unit.substring ? [{ ord: index + 1, text: unit.text }] : []));
}

export function idfWeight(documents: Prisma.Sql, matching: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`ln(1 + (${documents} - ${matching} + 0.5) / (${matching} + 0.5))`;
}
