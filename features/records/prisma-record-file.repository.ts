import type { RecordFileRepo, StoredRecordFile } from "./record-file.repo";
import type { RecordRef } from "./record-model.schema";
import type { PendingRecordFile, RecordFileDetails, RecordFileUploadRepo } from "./record-file-upload.repo";
import type { ExpiredRecordFile, RecordFileCleanupRepo, RecordFileExpiry } from "./record-file-cleanup.repo";
import type { RecordFilePurgeRepo } from "./record-file-purge.repo";
import type {
  RecordFileExtraction,
  RecordFileIndexCandidate,
  RecordFileIndexRepo,
  ReusableRecordFileExtraction,
} from "@/features/record-file-index/record-file-index.repo";
import type {
  RecordFileSemanticIndexRepo,
  UnembeddedRecordFileChunk,
} from "@/ee/record-file-index/record-file-semantic-index.repo";

import { Prisma } from "@/generated/prisma";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { BULK_WRITE_TRANSACTION, Transaction } from "@/core/decorators/transaction.decorator";

import { RECORD_FILE_PURGED_AT } from "./record-file-purge.repo";

const RECORD_FILE_INDEX_CLAIM_SECONDS = 300;
const RECORD_FILE_CHUNK_INSERT_BATCH = 200;

let semanticIndexColumn: Promise<boolean> | undefined;

const STORED_FILE_SELECT = {
  id: true,
  typeId: true,
  fieldId: true,
  recordId: true,
  storageDriver: true,
  storageKey: true,
  name: true,
  mimeType: true,
  size: true,
  sha256: true,
  status: true,
  uploadedById: true,
  createdAt: true,
  attachedAt: true,
  detachedAt: true,
} satisfies Prisma.RecordFileSelect;

function expiredFiles({ pendingBefore, detachedBefore }: RecordFileExpiry): Prisma.RecordFileWhereInput[] {
  return [
    { status: "pending", createdAt: { lt: pendingBefore } },
    { status: "detached", detachedAt: { lt: detachedBefore } },
  ];
}

export class PrismaRecordFileRepo
  extends TenantRepository
  implements
    RecordFileRepo,
    RecordFileUploadRepo,
    RecordFileCleanupRepo,
    RecordFilePurgeRepo,
    RecordFileIndexRepo,
    RecordFileSemanticIndexRepo
{
  constructor(private readonly scopedCompanyId?: string) {
    super();
  }

  override get companyId(): string {
    return this.scopedCompanyId ?? super.companyId;
  }

  async getFilesCompanyWide(fileIds: string[]): Promise<StoredRecordFile[]> {
    if (!fileIds.length) return [];
    const rows = await this.prisma.recordFile.findMany({
      where: { companyId: this.companyId, id: { in: [...new Set(fileIds)] } },
      select: STORED_FILE_SELECT,
    });
    return rows.map((row) => ({ ...row, size: Number(row.size) }));
  }

  async attachFiles(ref: RecordRef, fieldId: string, fileIds: string[]): Promise<number> {
    if (!fileIds.length) return 0;
    const result = await this.prisma.recordFile.updateMany({
      where: {
        companyId: this.companyId,
        typeId: ref.typeId,
        fieldId,
        id: { in: [...new Set(fileIds)] },
        OR: [{ recordId: null, status: { in: ["pending", "ready"] } }, { recordId: ref.recordId }],
      },
      data: {
        recordId: ref.recordId,
        status: "ready",
        attachedAt: new Date(),
        detachedAt: null,
      },
    });
    return result.count;
  }

  async detachFiles(ref: RecordRef, fieldId: string, fileIds: string[]): Promise<number> {
    if (!fileIds.length) return 0;
    const result = await this.prisma.recordFile.updateMany({
      where: {
        companyId: this.companyId,
        typeId: ref.typeId,
        fieldId,
        recordId: ref.recordId,
        id: { in: [...new Set(fileIds)] },
        status: { not: "detached" },
      },
      data: { status: "detached", detachedAt: new Date() },
    });
    return result.count;
  }

  async claimPendingFiles(limit: number): Promise<RecordFileIndexCandidate[]> {
    const rows = await this.prisma.$queryRaw<
      Array<Omit<RecordFileIndexCandidate, "size"> & { size: bigint }>
    >(Prisma.sql`
      WITH claimable AS MATERIALIZED (
        SELECT f."id" FROM "RecordFile" f
        WHERE f."companyId" = ${this.companyId} AND f."status" = 'ready' AND f."extractionStatus" = 'pending'
          AND (
            f."indexClaimedAt" IS NULL
            OR f."indexClaimedAt" < CURRENT_TIMESTAMP - make_interval(secs => ${RECORD_FILE_INDEX_CLAIM_SECONDS})
          )
        ORDER BY f."attachedAt" ASC NULLS LAST, f."id" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "RecordFile" file SET "indexClaimedAt" = CURRENT_TIMESTAMP, "indexAttempts" = file."indexAttempts" + 1
      FROM claimable c
      WHERE file."id" = c."id" AND file."companyId" = ${this.companyId}
      RETURNING file."id", file."name", file."mimeType", file."size", file."sha256", file."storageDriver",
        file."storageKey", file."indexAttempts"
    `);
    return rows.map((row) => ({ ...row, size: Number(row.size) }));
  }

  async findExtractionBySha256(sha256: string, exceptFileId: string): Promise<ReusableRecordFileExtraction | null> {
    const file = await this.prisma.recordFile.findFirst({
      where: { companyId: this.companyId, id: exceptFileId },
      select: { mimeType: true },
    });
    if (!file) return null;
    const twin = await this.prisma.recordFile.findFirst({
      where: {
        companyId: this.companyId,
        sha256,
        mimeType: file.mimeType,
        id: { not: exceptFileId },
        extractionStatus: { in: ["done", "noText"] },
      },
      orderBy: [{ indexedAt: "desc" }, { id: "asc" }],
      select: { extractionStatus: true, extractedText: true, textTruncated: true },
    });
    if (!twin) return null;
    if (twin.extractionStatus === "done" && twin.extractedText)
      return { status: "done", text: twin.extractedText, truncated: twin.textTruncated };
    return twin.extractionStatus === "noText" ? { status: "noText" } : null;
  }

  @Transaction(BULK_WRITE_TRANSACTION)
  async storeExtraction(fileId: string, extraction: RecordFileExtraction): Promise<void> {
    const done = extraction.status === "done" ? extraction : null;
    const updated = await this.prisma.recordFile.updateMany({
      where: { companyId: this.companyId, id: fileId, extractionStatus: "pending" },
      data: {
        extractionStatus: extraction.status,
        extractedText: done?.text ?? null,
        textTruncated: done?.truncated ?? false,
        indexedAt: new Date(),
        indexClaimedAt: null,
        embeddedModel: null,
      },
    });
    if (updated.count !== 1) return;
    await this.prisma.recordFileChunk.deleteMany({ where: { companyId: this.companyId, fileId } });
    const chunks = done?.chunks ?? [];
    for (let start = 0; start < chunks.length; start += RECORD_FILE_CHUNK_INSERT_BATCH) {
      await this.prisma.recordFileChunk.createMany({
        data: chunks.slice(start, start + RECORD_FILE_CHUNK_INSERT_BATCH).map((chunk) => ({
          companyId: this.companyId,
          fileId,
          ordinal: chunk.ordinal,
          offset: chunk.offset,
          heading: chunk.heading,
          text: chunk.text,
          contentHash: chunk.contentHash,
        })),
      });
    }
  }

  async releaseFileClaims(fileIds: string[]): Promise<void> {
    if (fileIds.length === 0) return;
    await this.prisma.recordFile.updateMany({
      where: { companyId: this.companyId, id: { in: fileIds } },
      data: { indexClaimedAt: null },
    });
  }

  @BypassTenantGuard
  async companiesWithStalledFilesUnscoped(pendingBefore: Date, limit: number): Promise<string[]> {
    const rows = await this.prisma.recordFile.groupBy({
      by: ["companyId"],
      where: {
        status: "ready",
        extractionStatus: "pending",
        attachedAt: { lt: pendingBefore },
        OR: [{ indexClaimedAt: null }, { indexClaimedAt: { lt: pendingBefore } }],
      },
      orderBy: { companyId: "asc" },
      take: limit,
    });
    return rows.map((row) => row.companyId);
  }

  async semanticIndexAvailable(): Promise<boolean> {
    semanticIndexColumn ??= this.prisma
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
        semanticIndexColumn = undefined;
        throw error;
      });
    return semanticIndexColumn;
  }

  async claimUnembeddedFiles(model: string, limit: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH claimable AS MATERIALIZED (
        SELECT f."id" FROM "RecordFile" f
        WHERE f."companyId" = ${this.companyId} AND f."status" = 'ready' AND f."extractionStatus" = 'done'
          AND f."embeddedModel" IS DISTINCT FROM ${model}
          AND (
            f."indexClaimedAt" IS NULL
            OR f."indexClaimedAt" < CURRENT_TIMESTAMP - make_interval(secs => ${RECORD_FILE_INDEX_CLAIM_SECONDS})
          )
        ORDER BY f."indexedAt" ASC NULLS LAST, f."id" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "RecordFile" file SET "indexClaimedAt" = CURRENT_TIMESTAMP
      FROM claimable c
      WHERE file."id" = c."id" AND file."companyId" = ${this.companyId}
      RETURNING file."id"
    `);
    return rows.map((row) => row.id);
  }

  async unembeddedChunks(fileId: string, model: string, limit: number): Promise<UnembeddedRecordFileChunk[]> {
    return this.prisma.recordFileChunk.findMany({
      where: { companyId: this.companyId, fileId, OR: [{ model: null }, { model: { not: model } }] },
      orderBy: { ordinal: "asc" },
      take: limit,
      select: { id: true, contentHash: true, text: true },
    });
  }

  async embeddingsByHash(model: string, contentHashes: string[]): Promise<Map<string, string>> {
    if (contentHashes.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<Array<{ contentHash: string; embedding: string }>>(Prisma.sql`
      SELECT DISTINCT ON (c."contentHash") c."contentHash", c."embedding"::text AS "embedding"
      FROM "RecordFileChunk" c
      WHERE c."companyId" = ${this.companyId} AND c."contentHash" = ANY(${contentHashes}::text[])
        AND c."model" = ${model} AND c."embedding" IS NOT NULL
      ORDER BY c."contentHash", c."id"
    `);
    return new Map(rows.map((row) => [row.contentHash, row.embedding]));
  }

  async storeChunkEmbeddings(model: string, embeddings: Array<{ id: string; embedding: string }>): Promise<void> {
    if (embeddings.length === 0) return;
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "RecordFileChunk" c
      SET "embedding" = u."embedding"::vector, "model" = ${model}, "embeddedAt" = CURRENT_TIMESTAMP
      FROM unnest(${embeddings.map(({ id }) => id)}::text[], ${embeddings.map(({ embedding }) => embedding)}::text[])
        AS u("id", "embedding")
      WHERE c."companyId" = ${this.companyId} AND c."id" = u."id"
    `);
  }

  async markFileEmbedded(fileId: string, model: string): Promise<boolean> {
    const updated = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "RecordFile" f SET "embeddedModel" = ${model}
      WHERE f."companyId" = ${this.companyId} AND f."id" = ${fileId}
        AND NOT EXISTS (
          SELECT 1 FROM "RecordFileChunk" c
          WHERE c."companyId" = ${this.companyId} AND c."fileId" = f."id" AND c."model" IS DISTINCT FROM ${model}
        )
    `);
    return updated === 1;
  }

  async createPendingFile(file: PendingRecordFile): Promise<void> {
    await this.prisma.recordFile.create({
      data: {
        ...file,
        size: BigInt(file.size),
        companyId: this.companyId,
        uploadedById: this.userId,
        status: "pending",
      },
    });
  }

  async getFileCompanyWide(fileId: string): Promise<RecordFileDetails | null> {
    const row = await this.prisma.recordFile.findFirst({
      where: { companyId: this.companyId, id: fileId },
      select: { ...STORED_FILE_SELECT, extractionStatus: true },
    });
    return row ? { ...row, size: Number(row.size) } : null;
  }

  async markFileUploaded(fileId: string, upload: { size: number; sha256: string }): Promise<boolean> {
    const result = await this.prisma.recordFile.updateMany({
      where: { companyId: this.companyId, id: fileId, status: "pending" },
      data: { size: BigInt(upload.size), sha256: upload.sha256 },
    });
    return result.count === 1;
  }

  async storageUsageCompanyWide(): Promise<number> {
    const usage = await this.prisma.recordFile.aggregate({
      where: { companyId: this.companyId },
      _sum: { size: true },
    });
    return Number(usage._sum.size ?? 0n);
  }

  @BypassTenantGuard
  async findFileCompaniesUnscoped(after: string | null, limit: number): Promise<string[]> {
    const groups = await this.prisma.recordFile.groupBy({
      by: ["companyId"],
      where: after ? { companyId: { gt: after } } : {},
      orderBy: { companyId: "asc" },
      take: limit,
    });
    return groups.map((group) => group.companyId);
  }

  async detachOrphanedFiles(attachedBefore: Date): Promise<number> {
    const companyId = this.companyId;
    return this.prisma.$executeRaw(Prisma.sql`
      UPDATE "RecordFile" AS f SET status = 'detached', "detachedAt" = NOW()
      WHERE f."companyId" = ${companyId} AND f.status = 'ready' AND f."attachedAt" < ${attachedBefore}
        AND NOT EXISTS (
          SELECT 1 FROM "RecordSchemaState" AS s
          WHERE s."companyId" = ${companyId} AND s."activeOperationId" IS NOT NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM "RecordValue" AS v
          WHERE v."companyId" = ${companyId} AND v."typeId" = f."typeId" AND v."recordId" = f."recordId"
            AND v."fieldId" = f."fieldId" AND v.state = 'value' AND f.id = ANY(v."textListValue")
        )`);
  }

  async findExpiredFiles(expiry: RecordFileExpiry, limit: number): Promise<ExpiredRecordFile[]> {
    return this.prisma.recordFile.findMany({
      where: { companyId: this.companyId, OR: expiredFiles(expiry) },
      select: { id: true, storageDriver: true, storageKey: true },
      orderBy: { id: "asc" },
      take: limit,
    });
  }

  async deleteExpiredFiles(ids: string[], expiry: RecordFileExpiry): Promise<number> {
    if (!ids.length) return 0;
    const result = await this.prisma.recordFile.deleteMany({
      where: { companyId: this.companyId, id: { in: [...new Set(ids)] }, OR: expiredFiles(expiry) },
    });
    return result.count;
  }

  async expireRecordFilesCompanyWide(companyId: string, refs: RecordRef[]): Promise<number> {
    if (!refs.length) return 0;
    const byType = new Map<string, string[]>();
    for (const ref of refs) byType.set(ref.typeId, [...(byType.get(ref.typeId) ?? []), ref.recordId]);
    const result = await this.prisma.recordFile.updateMany({
      where: {
        companyId,
        OR: [...byType].map(([typeId, recordIds]) => ({ typeId, recordId: { in: recordIds } })),
      },
      data: { status: "detached", detachedAt: RECORD_FILE_PURGED_AT },
    });
    return result.count;
  }

  async expireDefinitionFilesCompanyWide(
    companyId: string,
    { typeIds, fieldIds }: { typeIds: string[]; fieldIds: string[] },
  ): Promise<number> {
    if (!typeIds.length && !fieldIds.length) return 0;
    const result = await this.prisma.recordFile.updateMany({
      where: { companyId, OR: [{ typeId: { in: typeIds } }, { fieldId: { in: fieldIds } }] },
      data: { status: "detached", detachedAt: RECORD_FILE_PURGED_AT },
    });
    return result.count;
  }
}
