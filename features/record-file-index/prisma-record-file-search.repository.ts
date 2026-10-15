import type { ReadRecordFileContentRepo, StoredRecordFileContent } from "./read-record-file-content.repo";
import type {
  RecordFileFullTextCandidates,
  RecordFileSearchScope,
  RecordFileSearchTarget,
  RecordFileSection,
  RecordFileSemanticCandidates,
  SearchRecordFilesRepo,
} from "./search-record-files.repo";

import { Prisma } from "@/generated/prisma";

import { TenantRepository } from "@/core/base/tenant-repository";
import {
  fullTextUnits,
  fullTextUnitsCte,
  idfWeight,
  replaceQueryWords,
  substringUnits,
  textSearchConfigFor,
  typoCandidates,
} from "@/core/retrieval/full-text-query";
import {
  RETRIEVAL_TYPO_DOCUMENT_LIMIT,
  RETRIEVAL_TYPO_LENGTH_SLACK,
  RETRIEVAL_TYPO_MIN_SIMILARITY,
  RETRIEVAL_TYPO_PREFIX,
  RETRIEVAL_TYPO_TRANSPOSITION_MIN_LENGTH,
} from "@/core/retrieval/full-text-typo";
import { RETRIEVAL_SEMANTIC_MIN_SIMILARITY } from "@/core/retrieval/retrieval-pipeline";
import { fieldReadPredicate, recordReadPredicate } from "@/features/records/record-query";

import { RECORD_FILE_FULL_TEXT_CONFIGS } from "./record-file-content-query";

const RECORD_FILE_HEADING_WEIGHT = 2;

type RankedFileRow = {
  id: string | null;
  coverage: number | null;
  offset: number | null;
  heading: string | null;
  text: string | null;
  matched: number[] | null;
};

let embeddingColumn: Promise<boolean> | undefined;

export class PrismaRecordFileSearchRepo
  extends TenantRepository
  implements SearchRecordFilesRepo, ReadRecordFileContentRepo
{
  async getFileContent(fileId: string): Promise<StoredRecordFileContent | null> {
    const file = await this.prisma.recordFile.findFirst({
      where: { companyId: this.companyId, id: fileId },
      select: {
        id: true,
        typeId: true,
        fieldId: true,
        recordId: true,
        status: true,
        name: true,
        mimeType: true,
        size: true,
        extractionStatus: true,
        extractedText: true,
        textTruncated: true,
        indexedAt: true,
      },
    });
    return file ? { ...file, size: Number(file.size) } : null;
  }

  async getSearchTargets(ids: string[]): Promise<RecordFileSearchTarget[]> {
    if (ids.length === 0) return [];
    const files = await this.prisma.recordFile.findMany({
      where: { companyId: this.companyId, id: { in: ids }, status: "ready", recordId: { not: null } },
      select: { id: true, name: true, mimeType: true, typeId: true, recordId: true, fieldId: true },
    });
    return files.flatMap((file) => (file.recordId ? [{ ...file, recordId: file.recordId }] : []));
  }

  private get stopConfig() {
    return textSearchConfigFor(this.user.displayLanguage);
  }

  private readableFiles(scope: RecordFileSearchScope): Prisma.Sql | null {
    const record = Prisma.sql`record`;
    const branches = scope.model.fields.flatMap((field) => {
      const access = scope.access.get(field.typeId);
      if (field.valueType !== "file" || field.archived || !scope.typeIds.includes(field.typeId)) return [];
      if (!access || access.access === "none") return [];
      return [
        Prisma.sql`(f."typeId" = ${field.typeId} AND f."fieldId" = ${field.id}
          AND ${recordReadPredicate(this.companyId, access, record)}
          AND ${fieldReadPredicate(this.companyId, field, scope.model, scope.access, record)})`,
      ];
    });
    if (branches.length === 0) return null;
    return Prisma.sql`
      SELECT f."id", f."name", f."createdAt", f."extractionStatus", f."embeddedModel" FROM "RecordFile" f
      JOIN "CrmRecord" record ON record."companyId" = f."companyId" AND record."typeId" = f."typeId"
        AND record."id" = f."recordId" AND record."deletedAt" IS NULL
      JOIN "RecordValue" value ON value."companyId" = f."companyId" AND value."typeId" = f."typeId"
        AND value."recordId" = f."recordId" AND value."fieldId" = f."fieldId"
      WHERE f."companyId" = ${this.companyId} AND f."status" = 'ready' AND value."state" = 'value'
        AND f."id" = ANY(value."textListValue") AND (${Prisma.join(branches, " OR ")})`;
  }

  async fullTextFileCandidates(
    text: string,
    scope: RecordFileSearchScope,
    limit: number,
  ): Promise<RecordFileFullTextCandidates> {
    const readable = this.readableFiles(scope);
    if (!readable) return { keys: [], coverage: 0, sections: new Map() };
    const ranked = await this.rankedFullTextFiles(text, readable, limit);
    const corrections = await this.typoCorrections(typoCandidates(ranked.units, ranked.matched), readable);
    if (corrections.size === 0) return { keys: ranked.keys, coverage: ranked.coverage, sections: ranked.sections };
    const corrected = replaceQueryWords(text, corrections);
    const retried = await this.rankedFullTextFiles(corrected, readable, limit);
    return { keys: retried.keys, coverage: retried.coverage, sections: retried.sections, corrected };
  }

  private async rankedFullTextFiles(text: string, readable: Prisma.Sql, limit: number) {
    const units = fullTextUnits(text);
    if (units.length === 0) {
      return {
        units,
        keys: [],
        coverage: 0,
        sections: new Map<string, RecordFileSection>(),
        matched: new Set<number>(),
      };
    }
    const substrings = substringUnits(units);
    const rows = await this.prisma.$queryRaw<RankedFileRow[]>(Prisma.sql`
      WITH ${fullTextUnitsCte({ units, configs: RECORD_FILE_FULL_TEXT_CONFIGS, stopConfig: this.stopConfig })},
      "substringUnits" AS (
        SELECT * FROM unnest(${substrings.map(({ text: term }) => term)}::text[], ${substrings.map(({ ord }) => ord)}::int[])
          AS sub("term", "ord")
      ),
      files AS MATERIALIZED (${readable}),
      hits AS MATERIALIZED (
        SELECT c."fileId" AS "id", u."ord", bool_or(ts_filter(c."searchVector", '{a}'::"char"[]) @@ u."query") AS "title"
        FROM "RecordFileChunk" c
        JOIN units u ON c."searchVector" @@ u."query"
        JOIN files fl ON fl."id" = c."fileId"
        WHERE c."companyId" = ${this.companyId}
        GROUP BY c."fileId", u."ord"
        UNION ALL
        SELECT c."fileId", t."ord", bool_or(strpos(lower(coalesce(c."heading", '')), t."term") > 0)
        FROM "RecordFileChunk" c
        JOIN files fl ON fl."id" = c."fileId"
        JOIN "substringUnits" t ON strpos(lower(c."text"), t."term") > 0
        WHERE c."companyId" = ${this.companyId}
        GROUP BY c."fileId", t."ord"
      ),
      frequency AS MATERIALIZED (SELECT h."ord", count(*)::float8 AS "files" FROM hits h GROUP BY h."ord"),
      total AS (SELECT count(*)::float8 AS "files" FROM files),
      weights AS (
        SELECT q."ord", ${idfWeight(Prisma.sql`t."files"`, Prisma.sql`coalesce(fr."files", 0)`)} AS "weight"
        FROM (SELECT u."ord" FROM units u UNION SELECT sub."ord" FROM "substringUnits" sub) AS q
        CROSS JOIN total t LEFT JOIN frequency fr ON fr."ord" = q."ord"
      ),
      "queryWeight" AS (SELECT sum(w."weight") AS "weight" FROM weights w),
      scored AS (
        SELECT h."id", round(sum(${idfWeight(Prisma.sql`t."files"`, Prisma.sql`fr."files"`)}
          * CASE WHEN h."title" THEN ${RECORD_FILE_HEADING_WEIGHT}::float8 ELSE 1 END)::numeric, 9) AS "score",
          (sum(w."weight") / nullif(max(q."weight"), 0))::float8 AS "coverage"
        FROM hits h JOIN frequency fr ON fr."ord" = h."ord" JOIN weights w ON w."ord" = h."ord"
          CROSS JOIN total t CROSS JOIN "queryWeight" q
        GROUP BY h."id"
      ),
      top AS MATERIALIZED (
        SELECT ranked.* FROM (
          SELECT s."id", s."coverage", row_number() OVER (
            ORDER BY (to_tsvector('simple', fl."name") = to_tsvector('simple', ${text})) DESC, s."score" DESC,
              fl."createdAt" ASC, fl."id" ASC
          ) AS "rank"
          FROM scored s JOIN files fl ON fl."id" = s."id"
        ) ranked
        WHERE ranked."rank" <= ${limit}
      ),
      "rowUnits" AS MATERIALIZED (
        SELECT c."id", c."fileId", u."ord", ts_filter(c."searchVector", '{a}'::"char"[]) @@ u."query" AS "title"
        FROM "RecordFileChunk" c JOIN top r ON r."id" = c."fileId" JOIN units u ON c."searchVector" @@ u."query"
        WHERE c."companyId" = ${this.companyId}
        UNION ALL
        SELECT c."id", c."fileId", t."ord", strpos(lower(coalesce(c."heading", '')), t."term") > 0
        FROM "RecordFileChunk" c JOIN top r ON r."id" = c."fileId"
        JOIN "substringUnits" t ON strpos(lower(c."text"), t."term") > 0
        WHERE c."companyId" = ${this.companyId}
      ),
      "fileRows" AS (
        SELECT c."fileId", count(*)::float8 AS "rows" FROM "RecordFileChunk" c JOIN top r ON r."id" = c."fileId"
        WHERE c."companyId" = ${this.companyId}
        GROUP BY c."fileId"
      ),
      "fileUnitRows" AS (
        SELECT ru."fileId", ru."ord", count(*)::float8 AS "rows" FROM "rowUnits" ru GROUP BY ru."fileId", ru."ord"
      ),
      "rowWeights" AS (
        SELECT ru."id", ru."fileId", sum(${idfWeight(Prisma.sql`fr."rows"`, Prisma.sql`fu."rows"`)}
          * CASE WHEN ru."title" THEN ${RECORD_FILE_HEADING_WEIGHT}::float8 ELSE 1 END) AS "weight"
        FROM "rowUnits" ru
        JOIN "fileRows" fr ON fr."fileId" = ru."fileId"
        JOIN "fileUnitRows" fu ON fu."fileId" = ru."fileId" AND fu."ord" = ru."ord"
        GROUP BY ru."id", ru."fileId"
      ),
      best AS (
        SELECT DISTINCT ON (rw."fileId") rw."fileId", c."offset", c."heading", c."text"
        FROM "rowWeights" rw
        JOIN "RecordFileChunk" c ON c."companyId" = ${this.companyId} AND c."id" = rw."id"
        CROSS JOIN "anyUnit" a
        ORDER BY rw."fileId", rw."weight" DESC, ts_rank_cd(c."searchVector", coalesce(a."query", ''::tsquery), 1) DESC,
          c."ordinal" ASC
      )
      SELECT r."id", r."rank", coalesce(r."coverage", 0) AS "coverage", b."offset", b."heading", b."text",
        NULL::int[] AS "matched"
      FROM top r LEFT JOIN best b ON b."fileId" = r."id"
      UNION ALL
      SELECT NULL, NULL, NULL, NULL, NULL, NULL, array_agg(fr."ord")::int[] FROM frequency fr
      ORDER BY "rank" ASC NULLS LAST
    `);
    const sections = new Map<string, RecordFileSection>();
    for (const row of rows) {
      if (row.id !== null && row.text !== null)
        sections.set(row.id, { offset: row.offset ?? 0, heading: row.heading, text: row.text });
    }
    return {
      units,
      keys: rows.flatMap(({ id }) => (id === null ? [] : [id])),
      coverage: Math.max(0, ...rows.map(({ coverage }) => coverage ?? 0)),
      sections,
      matched: new Set(rows.find(({ id }) => id === null)?.matched ?? []),
    };
  }

  private async typoCorrections(terms: string[], readable: Prisma.Sql): Promise<Map<string, string>> {
    if (terms.length === 0) return new Map();
    const prefixes = [...new Set(terms.map((term) => Array.from(term).slice(0, RETRIEVAL_TYPO_PREFIX).join("")))];
    const prefixQuery = prefixes.map((prefix) => `'${prefix}':*`).join(" | ");
    const rows = await this.prisma.$queryRaw<Array<{ term: string; word: string }>>(Prisma.sql`
      WITH terms AS MATERIALIZED (
        SELECT w."term", wiki_search_sorted_letters(w."term") AS "sorted"
        FROM unnest(${terms}::text[]) AS w("term")
        WHERE numnode(plainto_tsquery(${this.stopConfig}::regconfig, w."term")) > 0
      ),
      files AS MATERIALIZED (${readable}),
      documents AS MATERIALIZED (
        SELECT c."text" FROM "RecordFileChunk" c JOIN files fl ON fl."id" = c."fileId"
        WHERE c."companyId" = ${this.companyId} AND c."searchVector" @@ to_tsquery('simple', ${prefixQuery})
        ORDER BY c."createdAt" DESC, c."id" ASC
        LIMIT ${RETRIEVAL_TYPO_DOCUMENT_LIMIT}
      ),
      words AS MATERIALIZED (
        SELECT w."word", count(*)::int AS "documents"
        FROM documents d
        CROSS JOIN LATERAL unnest(tsvector_to_array(to_tsvector('simple', wiki_search_markdown_text(d."text"))))
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
    `);
    return new Map(rows.map(({ term, word }) => [term, word]));
  }

  async semanticFileCandidates(
    vector: number[],
    model: string,
    scope: RecordFileSearchScope,
    limit: number,
  ): Promise<RecordFileSemanticCandidates | null> {
    if (!(await this.semanticIndexAvailable())) return null;
    const readable = this.readableFiles(scope);
    if (!readable) return { keys: [], similarity: null, sections: new Map(), stale: false };
    const embedding = `[${vector.join(",")}]`;
    const [rows, stale] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ id: string; offset: number; heading: string | null; text: string; similarity: number }>
      >(Prisma.sql`
        WITH files AS MATERIALIZED (${readable}),
        distances AS MATERIALIZED (
          SELECT c."fileId", c."id", c."ordinal", c."embedding" <=> ${embedding}::vector AS "distance"
          FROM "RecordFileChunk" c JOIN files fl ON fl."id" = c."fileId"
          WHERE c."companyId" = ${this.companyId} AND c."model" = ${model} AND c."embedding" IS NOT NULL
        ),
        grouped AS (SELECT d."fileId", min(d."distance") AS "distance" FROM distances d GROUP BY d."fileId"),
        best AS (
          SELECT DISTINCT ON (d."fileId") d."fileId", d."id" FROM distances d
          ORDER BY d."fileId", d."distance", d."ordinal"
        )
        SELECT g."fileId" AS "id", c."offset", c."heading", c."text", (1 - g."distance")::float8 AS "similarity"
        FROM grouped g
        JOIN best b ON b."fileId" = g."fileId"
        JOIN "RecordFileChunk" c ON c."companyId" = ${this.companyId} AND c."id" = b."id"
        WHERE g."distance" <= ${1 - RETRIEVAL_SEMANTIC_MIN_SIMILARITY}
        ORDER BY g."distance", g."fileId"
        LIMIT ${limit}
      `),
      this.prisma.$queryRaw<Array<{ stale: boolean }>>(Prisma.sql`
        WITH files AS MATERIALIZED (${readable})
        SELECT EXISTS (
          SELECT 1 FROM files fl WHERE fl."extractionStatus" = 'done' AND fl."embeddedModel" IS DISTINCT FROM ${model}
        ) AS "stale"
      `),
    ]);
    const isStale = stale[0]?.stale === true;
    return {
      keys: rows.map(({ id }) => id),
      similarity: isStale ? null : Math.max(0, ...rows.map(({ similarity }) => similarity)),
      sections: new Map(rows.map((row) => [row.id, { offset: row.offset, heading: row.heading, text: row.text }])),
      stale: isStale,
    };
  }

  private semanticIndexAvailable(): Promise<boolean> {
    embeddingColumn ??= this.prisma
      .$queryRaw<Array<{ available: boolean }>>(
        Prisma.sql`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'RecordFileChunk' AND column_name = 'embedding'
        ) AS "available"
      `,
      )
      .then((rows) => rows[0]?.available === true)
      .catch((error: unknown) => {
        embeddingColumn = undefined;
        throw error;
      });
    return embeddingColumn;
  }
}
