import type {
  ReadRecordFileContentRepo,
  StoredRecordFileContent,
} from "@/features/record-file-index/read-record-file-content.repo";
import type { RecordFileReadResult } from "../record-file.schema";

import { describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import { ExtractedRecordFileTextReader } from "@/features/record-file-index/extracted-record-file-text-reader";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail } from "@/core/validation/interactor-failure-server";
import { ReadRecordFileInteractor } from "../read-record-file.interactor";

const FILE_ID = "20000000-0000-4000-8000-000000000001";
const TEXT = Array.from({ length: 12 }, (_, index) =>
  `Clause ${index + 1} sets out the renewal terms. `.repeat(30),
).join("\n\n");

const DETAILS: RecordFileReadResult = {
  id: FILE_ID,
  typeId: "30000000-0000-4000-8000-000000000001",
  fieldId: "40000000-0000-4000-8000-000000000001",
  recordId: "50000000-0000-4000-8000-000000000001",
  name: "Contract.txt",
  mimeType: "text/plain",
  size: TEXT.length,
  status: "ready",
  uploadedAt: "2026-10-15T08:00:00.000Z",
  uploadedById: null,
  extractionStatus: "done",
  downloadUrl: `http://localhost:4000/api/v1/files/${FILE_ID}/content?token=signed`,
  downloadUrlExpiresAt: "2026-10-15T08:15:00.000Z",
};

function stored(overrides: Partial<StoredRecordFileContent> = {}): StoredRecordFileContent {
  return {
    id: FILE_ID,
    typeId: DETAILS.typeId,
    fieldId: DETAILS.fieldId,
    recordId: DETAILS.recordId,
    status: "ready",
    name: DETAILS.name,
    mimeType: DETAILS.mimeType,
    size: DETAILS.size,
    extractionStatus: "done",
    extractedText: TEXT,
    textTruncated: false,
    indexedAt: new Date("2026-10-15T08:00:00.000Z"),
    ...overrides,
  };
}

function interactor(details: RecordFileReadResult | null, file: StoredRecordFileContent | null) {
  const contents = { getFileContent: vi.fn(() => Promise.resolve(file)) } satisfies ReadRecordFileContentRepo;
  const files = {
    invoke: vi.fn(() =>
      Promise.resolve(
        details ? { ok: true as const, data: details } : fail(CustomErrorCode.recordFileNotFound, ["fileId"]),
      ),
    ),
  };
  return {
    contents,
    files,
    read: (offset = 0) =>
      runWithTenant(mockUser, () =>
        new ReadRecordFileInteractor(
          files,
          new ExtractedRecordFileTextReader(contents, "http://localhost:4000"),
        ).invoke({ fileId: FILE_ID, offset }),
      ),
  };
}

describe("ReadRecordFileInteractor", () => {
  it("returns a readable file's details with its extracted text in chunks that continue at nextOffset", async () => {
    const { read } = interactor(DETAILS, stored());

    const first = await read();
    if (!first.ok) throw new Error("Expected the file to be readable");
    expect(first.data).toMatchObject({ ...DETAILS, textAvailable: true, offset: 0, totalChars: TEXT.length });
    expect(first.data.text).toBe(TEXT.slice(0, first.data.text?.length));
    expect(first.data.nextOffset).toBeGreaterThan(0);

    const second = await read(first.data.nextOffset ?? 0);
    if (!second.ok) throw new Error("Expected the next chunk");
    expect(second.data.offset).toBe(first.data.nextOffset);
    expect(second.data.text).toBe(
      TEXT.slice(second.data.offset ?? 0, (second.data.offset ?? 0) + (second.data.text?.length ?? 0)),
    );
    expect(Object.keys(second.data).sort()).toEqual(
      [...Object.keys(DETAILS), "textAvailable", "text", "offset", "nextOffset", "totalChars"].sort(),
    );
  });

  it("reports no text while extraction has not finished or found none", async () => {
    for (const file of [
      stored({ extractionStatus: "pending", extractedText: null }),
      stored({ extractionStatus: "noText", extractedText: null }),
    ]) {
      const outcome = await interactor(DETAILS, file).read();
      expect(outcome).toEqual({ ok: true, data: { ...DETAILS, textAvailable: false } });
    }
  });

  it("does not read text for a pending upload and passes access failures on unchanged", async () => {
    const pending = interactor({ ...DETAILS, status: "pending", recordId: null }, stored());
    expect(await pending.read()).toEqual({
      ok: true,
      data: { ...DETAILS, status: "pending", recordId: null, textAvailable: false },
    });
    expect(pending.contents.getFileContent).not.toHaveBeenCalled();

    const hidden = interactor(null, stored());
    const outcome = await hidden.read();
    expect(outcome.ok).toBe(false);
    expect(hidden.contents.getFileContent).not.toHaveBeenCalled();
  });
});
