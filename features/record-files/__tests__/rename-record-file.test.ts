import type { InteractorOutcome } from "@/core/validation/validation.utils";
import type { RecordFileDetails } from "@/features/records/record-file-upload.repo";

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

import { CustomErrorCode } from "@/core/validation/validation.types";
import { unwindFailure } from "@/core/validation/failure-unwind";
import { RenameRecordFileInteractor } from "../rename-record-file.interactor";

const FILE_ID = "20000000-0000-4000-8000-000000000001";
const TYPE_ID = "30000000-0000-4000-8000-000000000001";
const FIELD_ID = "40000000-0000-4000-8000-000000000001";
const RECORD_ID = "50000000-0000-4000-8000-000000000001";

function details(overrides: Partial<RecordFileDetails> = {}): RecordFileDetails {
  return {
    id: FILE_ID,
    typeId: TYPE_ID,
    fieldId: FIELD_ID,
    recordId: RECORD_ID,
    conversationId: null,
    storageDriver: "database",
    storageKey: "key",
    name: "Offer.pdf",
    mimeType: "application/pdf",
    size: 10,
    sha256: null,
    status: "ready",
    uploadedById: mockUser.id,
    createdAt: new Date("2026-10-23T08:00:00.000Z"),
    extractionStatus: "done",
    pageCount: 1,
    ...overrides,
  } as RecordFileDetails;
}

function setup(file: RecordFileDetails | null, options: { paused?: boolean; refuse?: boolean } = {}) {
  const files = { getFileCompanyWide: vi.fn().mockResolvedValue(file), renameFileCompanyWide: vi.fn() };
  const records = {
    getState: vi.fn().mockResolvedValue({ activeOperationId: options.paused ? "op" : null }),
    getModel: vi.fn().mockResolvedValue({ revision: 3, fields: [], types: [] }),
    getRecordCompanyWide: vi.fn().mockResolvedValue({
      version: 4,
      values: [{ fieldId: FIELD_ID, state: "value", textListValue: [FILE_ID] }],
    }),
  };
  const writer = {
    validateAccess: vi.fn(() =>
      options.refuse
        ? Promise.reject(unwindFailure(CustomErrorCode.permissionDenied, "authorization"))
        : Promise.resolve(),
    ),
  };
  const interactor = new RenameRecordFileInteractor(
    records as never,
    { load: () => Promise.resolve({ actor: { id: mockUser.id } }) } as never,
    writer,
    files,
  );
  return {
    files,
    writer,
    rename: (name: string) => runWithTenant(mockUser, () => interactor.invoke({ fileId: FILE_ID, name })),
  };
}

function code(outcome: InteractorOutcome<unknown>) {
  if (outcome.ok) return null;
  const issue = outcome.error.issues[0];
  return issue?.code === "custom" ? (issue.params as { error?: string } | undefined)?.error : issue?.code;
}

describe("RenameRecordFileInteractor", () => {
  it("refuses an invalid name before checking access or writing", async () => {
    const { files, writer, rename } = setup(details());
    expect(code(await rename("folder/Offer"))).toBe(CustomErrorCode.recordFileNameInvalid);
    expect(writer.validateAccess).not.toHaveBeenCalled();
    expect(files.renameFileCompanyWide).not.toHaveBeenCalled();
  });

  it("returns the record writer's refusal instead of throwing and leaves the name unchanged", async () => {
    const { files, writer, rename } = setup(details(), { refuse: true });
    const outcome = await rename("Signed");
    expect(code(outcome)).toBe(CustomErrorCode.permissionDenied);
    expect(writer.validateAccess).toHaveBeenCalledWith(
      {
        action: "update",
        ref: { typeId: TYPE_ID, recordId: RECORD_ID },
        expectedVersion: 4,
        fields: [{ fieldId: FIELD_ID, value: { kind: "file", value: [FILE_ID] } }],
      },
      expect.anything(),
    );
    expect(files.renameFileCompanyWide).not.toHaveBeenCalled();
  });

  it("waits while a workspace change runs and hides other people's pending files", async () => {
    expect(code(await setup(details(), { paused: true }).rename("Signed"))).toBe(CustomErrorCode.recordWritePaused);
    const foreign = setup(details({ status: "pending", uploadedById: "60000000-0000-4000-8000-000000000001" }));
    expect(code(await foreign.rename("Signed"))).toBe(CustomErrorCode.recordFileNotFound);
    expect(foreign.files.renameFileCompanyWide).not.toHaveBeenCalled();
  });

  it("renames the uploader's own pending file without a record write and keeps an unchanged name as is", async () => {
    const own = setup(details({ status: "pending", typeId: null, recordId: null }));
    const outcome = await own.rename("Draft");
    expect(outcome).toMatchObject({ ok: true, data: { name: "Draft.pdf", status: "pending" } });
    expect(own.files.renameFileCompanyWide).toHaveBeenCalledWith(FILE_ID, "Draft.pdf");
    expect(own.writer.validateAccess).not.toHaveBeenCalled();
    const same = setup(details());
    expect(await same.rename("Offer")).toMatchObject({ ok: true, data: { name: "Offer.pdf" } });
    expect(same.files.renameFileCompanyWide).not.toHaveBeenCalled();
  });
});
