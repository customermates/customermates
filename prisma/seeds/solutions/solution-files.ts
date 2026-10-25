import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { presetId } from "@/features/records/crm-preset";
import { recordFileChunks } from "@/features/record-file-index/record-file-chunks";
import { extractRecordFileText } from "@/features/record-file-index/record-file-text";
import { recordFileTextFormat } from "@/features/record-file-index/record-file-text-format";
import type { PrismaClient } from "@/generated/prisma";

import { csvDocument, docxDocument, pdfDocument, xlsxDocument } from "../document-builders";
import { workspaceFixtureId } from "../helpers";
import { storyMoment } from "../timeline";
import type { FileKind, FileSpec, SolutionContent } from "./define-solution";
import { solutionMemberId, type SolutionRecordData, type SolutionValueRow } from "./solution-data";
import type { SolutionWorkspace } from "./solution-workspaces";

export const SOLUTION_FILE_GROUP = "4c000000";
const SOLUTION_FILE_CHUNK_GROUP = "4c100000";

const PHOTO_DIRECTORY = fileURLToPath(new URL("./assets/photos/", import.meta.url));

const MIME_TYPES: Record<FileKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  md: "text/markdown",
  jpg: "image/jpeg",
};

export function solutionFileId(workspace: SolutionWorkspace, index: number): string {
  return workspaceFixtureId(SOLUTION_FILE_GROUP, workspace.tag, index + 1);
}

/** The storage key of a seeded file: uploads add a random suffix, the seed a fixed one so reruns keep the key. */
export function solutionFileStorageKey(companyId: string, fileId: string): string {
  return `${companyId}/${fileId}/seed`;
}

function fileBytes(spec: FileSpec, content: SolutionContent): Uint8Array {
  switch (spec.kind) {
    case "pdf":
      return pdfDocument(spec.lines ?? [], content.companyName);
    case "docx":
      return docxDocument(spec.lines ?? []);
    case "md":
      return new TextEncoder().encode(`${(spec.lines ?? []).join("\n")}\n`);
    case "xlsx":
      return xlsxDocument(spec.name.replace(/\.xlsx$/u, "").slice(0, 31), spec.rows ?? []);
    case "csv":
      return csvDocument(spec.rows ?? []);
    case "jpg":
      if (!spec.photo) throw new Error(`${spec.key} needs a photo`);
      return new Uint8Array(readFileSync(join(PHOTO_DIRECTORY, spec.photo)));
  }
}

/**
 * The file values of the records: each file field lists its files in the order the solution names them. Files must
 * name a record of the solution and one of its file fields.
 */
export function solutionFileValues(
  workspace: SolutionWorkspace,
  content: SolutionContent,
  data: Pick<SolutionRecordData, "ids">,
): SolutionValueRow[] {
  const values = new Map<string, SolutionValueRow & { value: { kind: "file"; value: string[] } }>();
  for (const [index, spec] of (content.files ?? []).entries()) {
    const ref = data.ids.get(spec.record);
    if (!ref) throw new Error(`${workspace.slug}: file ${spec.key} names unknown record ${spec.record}`);
    const field = content.fields.find((candidate) => candidate.key === spec.field);
    if (field?.type !== "file" || !spec.record.startsWith(`${spec.field.split(".")[0]}:`))
      throw new Error(`${workspace.slug}: file ${spec.key} needs a file field of its record's list`);
    const fieldId = presetId(workspace.companyId, spec.field);
    const key = `${ref.recordId}:${fieldId}`;
    const existing = values.get(key);
    if (existing) existing.value.value.push(solutionFileId(workspace, index));
    else {
      values.set(key, {
        typeId: ref.typeId,
        recordId: ref.recordId,
        fieldId,
        value: { kind: "file", value: [solutionFileId(workspace, index)] },
      });
    }
  }
  return [...values.values()];
}

/**
 * Stores the solution's files as the database storage driver and the file index leave an uploaded, attached and
 * indexed file: the file row, its bytes in one content part and the extracted text split into searchable chunks.
 * Photos have no text. A repeated run rewrites the same rows and removes seeded files the solution no longer has.
 */
export async function seedSolutionFiles(
  prisma: PrismaClient,
  workspace: SolutionWorkspace,
  content: SolutionContent,
  data: Pick<SolutionRecordData, "ids">,
): Promise<number> {
  const { companyId } = workspace;
  const files = await Promise.all(
    (content.files ?? []).map(async (spec, index) => {
      const bytes = fileBytes(spec, content);
      const mimeType = MIME_TYPES[spec.kind];
      const format = recordFileTextFormat(mimeType, spec.name);
      const text = format ? await extractRecordFileText(bytes, format) : null;
      if (format && text?.status !== "done") throw new Error(`${workspace.slug}: ${spec.name} has no readable text`);
      const ref = data.ids.get(spec.record);
      if (!ref) throw new Error(`${workspace.slug}: file ${spec.key} names unknown record ${spec.record}`);
      return { spec, index, id: solutionFileId(workspace, index), bytes, mimeType, text, ref };
    }),
  );

  await prisma.$transaction(
    async (tx) => {
      const stale = await tx.recordFile.findMany({
        where: {
          companyId,
          id: { startsWith: `${SOLUTION_FILE_GROUP}-${workspace.tag}-`, notIn: files.map(({ id }) => id) },
        },
        select: { id: true, storageKey: true },
      });
      await tx.recordFileContent.deleteMany({
        where: { companyId, fileKey: { in: stale.map(({ storageKey }) => storageKey) } },
      });
      await tx.recordFile.deleteMany({ where: { companyId, id: { in: stale.map(({ id }) => id) } } });

      for (const { spec, index, id, bytes, mimeType, text, ref } of files) {
        const storageKey = solutionFileStorageKey(companyId, id);
        const uploadedAt = storyMoment(spec.uploadedDaysAgo, 30 + index * 7);
        const row = {
          companyId,
          typeId: ref.typeId,
          fieldId: presetId(companyId, spec.field),
          recordId: ref.recordId,
          storageDriver: "database",
          storageKey,
          name: spec.name,
          mimeType,
          size: BigInt(bytes.byteLength),
          sha256: createHash("sha256").update(bytes).digest("hex"),
          status: "ready" as const,
          uploadedById: solutionMemberId(workspace, spec.by),
          extractionStatus: text ? ("done" as const) : ("unsupported" as const),
          extractedText: text?.status === "done" ? text.text : null,
          textTruncated: text?.status === "done" ? text.truncated : false,
          createdAt: uploadedAt,
          attachedAt: uploadedAt,
          detachedAt: null,
          indexedAt: uploadedAt,
          indexClaimedAt: null,
          indexAttempts: 0,
          embeddedModel: null,
        };
        await tx.recordFile.upsert({ where: { id }, create: { id, ...row }, update: row });
        await tx.recordFileContent.deleteMany({ where: { companyId, fileKey: storageKey } });
        await tx.recordFileContent.create({ data: { fileKey: storageKey, part: 0, companyId, data: bytes } });
        await tx.recordFileChunk.deleteMany({ where: { companyId, fileId: id } });
        if (text?.status !== "done") continue;
        await tx.recordFileChunk.createMany({
          data: recordFileChunks(spec.name, text.text).map((chunk) => ({
            id: workspaceFixtureId(SOLUTION_FILE_CHUNK_GROUP, workspace.tag, (index + 1) * 1000 + chunk.ordinal + 1),
            companyId,
            fileId: id,
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
  return files.length;
}
