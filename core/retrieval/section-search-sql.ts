import { Prisma } from "@/generated/prisma";

import {
  RETRIEVAL_TYPO_DOCUMENT_LIMIT,
  RETRIEVAL_TYPO_LENGTH_SLACK,
  RETRIEVAL_TYPO_MIN_SIMILARITY,
  RETRIEVAL_TYPO_PREFIX,
  RETRIEVAL_TYPO_TRANSPOSITION_MIN_LENGTH,
} from "./full-text-typo";
import { fullTextUnitsCte, idfWeight, substringUnits, type FullTextUnit } from "./full-text-query";
import { RETRIEVAL_SEMANTIC_MIN_SIMILARITY } from "./retrieval-pipeline";

const SECTION_TITLE_WEIGHT = 2;

export type SectionCorpusSql = {
  table: Prisma.Sql;
  scope: Prisma.Sql;
  group: Prisma.Sql;
  columns: readonly string[];
  order: Prisma.Sql;
  configs: readonly string[];
  stopConfig: string;
};

export type SectionMatch = { group: string; id: string };

function column(name: string, alias: string) {
  return Prisma.raw(`${alias}."${name.replaceAll('"', "")}"`);
}

function selected(corpus: SectionCorpusSql, alias: string) {
  return corpus.columns.length === 0
    ? Prisma.empty
    : Prisma.sql`, ${Prisma.join(
        corpus.columns.map((name) => column(name, alias)),
        ", ",
      )}`;
}

function scopedSections(corpus: SectionCorpusSql, extra: Prisma.Sql = Prisma.empty) {
  return Prisma.sql`SELECT s."id", ${corpus.group} AS "group", s."pageTitle", s."headingPath", s."text"${selected(corpus, "s")}${extra}
    FROM ${corpus.table} s WHERE ${corpus.scope}`;
}

export function rankedSectionsSql(args: {
  corpus: SectionCorpusSql;
  units: readonly FullTextUnit[];
  limit: number;
  exactTitle?: string;
}): Prisma.Sql {
  const { corpus, units } = args;
  const substrings = substringUnits(units);
  const exact =
    args.exactTitle === undefined
      ? Prisma.empty
      : Prisma.sql`(to_tsvector('simple', b."pageTitle") = to_tsvector('simple', ${args.exactTitle})) DESC,`;
  return Prisma.sql`
    WITH ${fullTextUnitsCte({ units, configs: corpus.configs, stopConfig: corpus.stopConfig })},
    "substringUnits" AS (
      SELECT * FROM unnest(${substrings.map(({ text }) => text)}::text[], ${substrings.map(({ ord }) => ord)}::int[])
        AS sub("term", "ord")
    ),
    scoped AS MATERIALIZED (${scopedSections(corpus, Prisma.sql`, s."searchVector"`)}),
    hits AS MATERIALIZED (
      SELECT s."group", u."ord", bool_or(ts_filter(s."searchVector", '{a}'::"char"[]) @@ u."query") AS "title"
      FROM scoped s JOIN units u ON s."searchVector" @@ u."query"
      GROUP BY s."group", u."ord"
      UNION ALL
      SELECT s."group", t."ord",
        bool_or(strpos(lower(s."pageTitle" || E'\n' || array_to_string(s."headingPath", E'\n')), t."term") > 0)
      FROM scoped s
      JOIN "substringUnits" t
        ON strpos(lower(s."pageTitle" || E'\n' || array_to_string(s."headingPath", E'\n') || E'\n' || s."text"), t."term") > 0
      GROUP BY s."group", t."ord"
    ),
    frequency AS MATERIALIZED (SELECT h."ord", count(*)::float8 AS "groups" FROM hits h GROUP BY h."ord"),
    total AS (SELECT count(DISTINCT s."group")::float8 AS "groups" FROM scoped s),
    weights AS (
      SELECT q."ord", ${idfWeight(Prisma.sql`t."groups"`, Prisma.sql`coalesce(f."groups", 0)`)} AS "weight"
      FROM (SELECT u."ord" FROM units u UNION SELECT sub."ord" FROM "substringUnits" sub) AS q
      CROSS JOIN total t LEFT JOIN frequency f ON f."ord" = q."ord"
    ),
    "queryWeight" AS (SELECT sum(w."weight") AS "weight" FROM weights w),
    scored AS (
      SELECT h."group",
        round(sum(${idfWeight(Prisma.sql`t."groups"`, Prisma.sql`f."groups"`)}
          * CASE WHEN h."title" THEN ${SECTION_TITLE_WEIGHT}::float8 ELSE 1 END)::numeric, 9) AS "score",
        (sum(w."weight") / nullif(max(q."weight"), 0))::float8 AS "coverage"
      FROM hits h JOIN frequency f ON f."ord" = h."ord" JOIN weights w ON w."ord" = h."ord"
        CROSS JOIN total t CROSS JOIN "queryWeight" q
      GROUP BY h."group"
    ),
    "rowUnits" AS MATERIALIZED (
      SELECT s."id", s."group", u."ord", ts_filter(s."searchVector", '{a}'::"char"[]) @@ u."query" AS "title"
      FROM scoped s JOIN scored r ON r."group" = s."group" JOIN units u ON s."searchVector" @@ u."query"
      UNION ALL
      SELECT s."id", s."group", t."ord",
        strpos(lower(s."pageTitle" || E'\n' || array_to_string(s."headingPath", E'\n')), t."term") > 0
      FROM scoped s JOIN scored r ON r."group" = s."group"
      JOIN "substringUnits" t
        ON strpos(lower(s."pageTitle" || E'\n' || array_to_string(s."headingPath", E'\n') || E'\n' || s."text"), t."term") > 0
    ),
    "groupRows" AS (
      SELECT s."group", count(*)::float8 AS "rows" FROM scoped s JOIN scored r ON r."group" = s."group" GROUP BY s."group"
    ),
    "groupUnitRows" AS (
      SELECT ru."group", ru."ord", count(*)::float8 AS "rows" FROM "rowUnits" ru GROUP BY ru."group", ru."ord"
    ),
    "rowWeights" AS (
      SELECT ru."id", sum(${idfWeight(Prisma.sql`g."rows"`, Prisma.sql`gu."rows"`)}
        * CASE WHEN ru."title" THEN ${SECTION_TITLE_WEIGHT}::float8 ELSE 1 END) AS "weight"
      FROM "rowUnits" ru
      JOIN "groupRows" g ON g."group" = ru."group"
      JOIN "groupUnitRows" gu ON gu."group" = ru."group" AND gu."ord" = ru."ord"
      GROUP BY ru."id"
    ),
    best AS (
      SELECT DISTINCT ON (s."group") s.*, ts_rank_cd(s."searchVector", coalesce(a."query", ''::tsquery), 1) AS "rank"
      FROM scoped s JOIN scored r ON r."group" = s."group" CROSS JOIN "anyUnit" a
      LEFT JOIN "rowWeights" rw ON rw."id" = s."id"
      ORDER BY s."group", coalesce(rw."weight", 0) DESC,
        ts_rank_cd(s."searchVector", coalesce(a."query", ''::tsquery), 1) DESC, ${corpus.order}
    ),
    ranked AS (
      SELECT b."group", b."id", coalesce(r."coverage", 0) AS "coverage"${selected(corpus, "b")},
        row_number() OVER (ORDER BY ${exact} r."score" DESC, b."rank" DESC, b."group" ASC) AS "position"
      FROM scored r JOIN best b ON b."group" = r."group"
    )
    SELECT r.*, NULL::int[] AS "matched" FROM ranked r WHERE r."position" <= ${args.limit}
    UNION ALL
    SELECT ${Prisma.join(
      [
        Prisma.sql`NULL::text`,
        Prisma.sql`NULL::text`,
        Prisma.sql`NULL::float8`,
        ...corpus.columns.map(() => Prisma.sql`NULL`),
        Prisma.sql`NULL::bigint`,
      ],
      ", ",
    )}, array_agg(f."ord")::int[] FROM frequency f
    ORDER BY "position" ASC NULLS LAST
  `;
}

export function sectionTypoCorrectionsSql(corpus: SectionCorpusSql, terms: readonly string[]): Prisma.Sql {
  const prefixes = [...new Set(terms.map((term) => `%${Array.from(term).slice(0, RETRIEVAL_TYPO_PREFIX).join("")}%`))];
  return Prisma.sql`
    WITH terms AS MATERIALIZED (
      SELECT w."term", wiki_search_sorted_letters(w."term") AS "sorted"
      FROM unnest(${[...terms]}::text[]) AS w("term")
      WHERE numnode(plainto_tsquery(${corpus.stopConfig}::regconfig, w."term")) > 0
    ),
    documents AS MATERIALIZED (
      SELECT s."pageTitle" || E'\n' || array_to_string(s."headingPath", E'\n') || E'\n' || s."text" AS "content"
      FROM (${scopedSections(corpus)}) s
      WHERE lower(s."pageTitle" || E'\n' || s."text") LIKE ANY (${prefixes}::text[])
      ORDER BY ${corpus.order}
      LIMIT ${RETRIEVAL_TYPO_DOCUMENT_LIMIT}
    ),
    words AS MATERIALIZED (
      SELECT w."word", count(*)::int AS "documents"
      FROM documents d
      CROSS JOIN LATERAL unnest(tsvector_to_array(to_tsvector('simple', wiki_search_markdown_text(d."content"))))
        AS w("word")
      GROUP BY w."word"
    ),
    matches AS (
      SELECT t."term", w."word", w."documents", similarity(t."term", w."word") AS "score",
        length(w."word") = length(t."term") AND wiki_search_sorted_letters(w."word") = t."sorted" AS "transposed"
      FROM terms t
      JOIN words w ON left(w."word", ${RETRIEVAL_TYPO_PREFIX}::int) = left(t."term", ${RETRIEVAL_TYPO_PREFIX}::int)
        AND w."word" <> t."term"
        AND abs(length(w."word") - length(t."term")) <= ${RETRIEVAL_TYPO_LENGTH_SLACK}::int
    )
    SELECT DISTINCT ON (m."term") m."term", m."word"
    FROM matches m
    WHERE m."score" >= ${RETRIEVAL_TYPO_MIN_SIMILARITY}::float4
      OR (m."transposed" AND length(m."term") >= ${RETRIEVAL_TYPO_TRANSPOSITION_MIN_LENGTH}::int)
    ORDER BY m."term", m."score" DESC, m."documents" DESC, m."word" ASC
  `;
}

export function semanticSectionsSql(args: {
  corpus: SectionCorpusSql;
  vector: readonly number[];
  version: string;
  limit: number;
  penalty?: Prisma.Sql;
}): Prisma.Sql {
  const { corpus } = args;
  const embedding = `[${args.vector.join(",")}]`;
  return Prisma.sql`
    WITH distances AS MATERIALIZED (
      SELECT s."id", ${corpus.group} AS "group", s."pageTitle"${selected(corpus, "s")},
        s."embedding" <=> ${embedding}::vector AS "distance",
        ${args.penalty ?? Prisma.sql`0`}::float8 AS "penalty"
      FROM ${corpus.table} s
      WHERE ${corpus.scope} AND s."embeddingVersion" = ${args.version} AND s."embedding" IS NOT NULL
    ),
    groups AS (SELECT d."group", min(d."distance") AS "distance" FROM distances d GROUP BY d."group"),
    best AS (
      SELECT DISTINCT ON (s."group") s.*
      FROM distances s
      ORDER BY s."group", s."distance" + s."penalty", ${corpus.order}
    )
    SELECT b."group", b."id"${selected(corpus, "b")}, (1 - g."distance")::float8 AS "similarity"
    FROM groups g JOIN best b ON b."group" = g."group"
    WHERE g."distance" <= ${1 - RETRIEVAL_SEMANTIC_MIN_SIMILARITY}
    ORDER BY g."distance", g."group"
    LIMIT ${args.limit}
  `;
}

export function sectionEmbeddingAvailableSql(table: string): Prisma.Sql {
  return Prisma.sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ${table} AND column_name = 'embedding'
    ) AS "available"
  `;
}
