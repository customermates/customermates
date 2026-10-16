import { createHash } from "node:crypto";

import { presetId } from "@/features/records/crm-preset";
import { recordFileChunks } from "@/features/record-file-index/record-file-chunks";
import { extractRecordFileText, recordFileTextFormat } from "@/features/record-file-index/record-file-text";

import type { SeedContext } from "./context";

import { fixtureId } from "./helpers";
import { northwindAt, northwindDataset } from "./northwind-data";
import { NORTHWIND_FILE_ID_PREFIX, northwindRecordFiles } from "./northwind-files";
import { NORTHWIND_MEMBER_IDS } from "./northwind-model";

/** The storage key of a seeded file; uploads add a random suffix, the seed a fixed one so reruns keep the key. */
export function northwindFileStorageKey(companyId: string, fileId: string): string {
  return `${companyId}/${fileId}/seed`;
}

/** A fixed id per seeded chunk, so a repeated run writes the same rows instead of new ones. */
function chunkId(fileNumber: number, ordinal: number): string {
  return fixtureId(`4c1${String(fileNumber).padStart(5, "0")}`, ordinal + 1);
}

/**
 * Stores the demo's record files as the database storage driver and the file index leave an uploaded, attached and
 * indexed file: the file row, its bytes in one content part, and the extracted text split into searchable chunks.
 * The organizations' Documents values point at these ids. A repeated run rewrites the same rows and removes seeded
 * files that are no longer part of the fixture.
 */
export async function seedRecordFiles(context: SeedContext): Promise<void> {
  const companyId = context.ids.company;
  const typeId = presetId(companyId, "organization");
  const fieldId = presetId(companyId, "organization.documents");
  const organizations = northwindDataset().organizations;
  const files = await Promise.all(
    northwindRecordFiles().map(async (file) => {
      const bytes = new TextEncoder().encode(file.content);
      const format = recordFileTextFormat(file.mimeType, file.name);
      const text = format ? await extractRecordFileText(bytes, format) : null;
      if (text?.status !== "done") throw new Error(`Seeded record file ${file.name} has no readable text`);
      const organization = organizations[file.organizationIndex];
      if (!organization) throw new Error(`Missing Northwind organization for ${file.name}`);
      return { file, bytes, text, recordId: organization.id };
    }),
  );

  await context.prisma.$transaction(
    async (prisma) => {
      const stale = await prisma.recordFile.findMany({
        where: {
          companyId,
          id: { startsWith: `${NORTHWIND_FILE_ID_PREFIX}-`, notIn: files.map(({ file }) => file.id) },
        },
        select: { id: true, storageKey: true },
      });
      await prisma.recordFileContent.deleteMany({
        where: { companyId, fileKey: { in: stale.map(({ storageKey }) => storageKey) } },
      });
      await prisma.recordFile.deleteMany({ where: { companyId, id: { in: stale.map(({ id }) => id) } } });

      for (const [index, { file, bytes, text, recordId }] of files.entries()) {
        const storageKey = northwindFileStorageKey(companyId, file.id);
        const uploadedAt = northwindAt(file.uploadedAtMs);
        const row = {
          companyId,
          typeId,
          fieldId,
          recordId,
          storageDriver: "database",
          storageKey,
          name: file.name,
          mimeType: file.mimeType,
          size: BigInt(bytes.byteLength),
          sha256: createHash("sha256").update(bytes).digest("hex"),
          status: "ready" as const,
          uploadedById: NORTHWIND_MEMBER_IDS[file.uploadedBy],
          extractionStatus: "done" as const,
          extractedText: text.text,
          textTruncated: text.truncated,
          createdAt: uploadedAt,
          attachedAt: uploadedAt,
          detachedAt: null,
          indexedAt: uploadedAt,
          indexClaimedAt: null,
          indexAttempts: 0,
          embeddedModel: null,
        };
        await prisma.recordFile.upsert({ where: { id: file.id }, create: { id: file.id, ...row }, update: row });
        await prisma.recordFileContent.deleteMany({ where: { companyId, fileKey: storageKey } });
        await prisma.recordFileContent.create({ data: { fileKey: storageKey, part: 0, companyId, data: bytes } });
        await prisma.recordFileChunk.deleteMany({ where: { companyId, fileId: file.id } });
        await prisma.recordFileChunk.createMany({
          data: recordFileChunks(file.name, text.text).map((chunk) => ({
            id: chunkId(index + 1, chunk.ordinal),
            companyId,
            fileId: file.id,
            ordinal: chunk.ordinal,
            offset: chunk.offset,
            heading: chunk.heading,
            text: chunk.text,
            contentHash: chunk.contentHash,
            createdAt: uploadedAt,
          })),
        });
      }
    },
    { maxWait: 60000, timeout: 600000 },
  );
}
