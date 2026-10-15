import type { RecordFileDetails } from "@/features/records/record-file-upload.repo";

import { describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({ env: { APP_MODE: "cloud", BASE_URL: "http://127.0.0.1:4000", NODE_ENV: "test" } }));

const { runWithTenant } = await import("@/core/decorators/tenant-context");
const { failureUnwindCause } = await import("@/core/validation/failure-unwind");
const { RecordFileAccessService } = await import("../record-file-access.service");

const USER = createMockUser({ id: "30000000-0000-4000-8000-000000000001" });
const TYPE_ID = "30000000-0000-4000-8000-000000000002";
const FIELD_ID = "30000000-0000-4000-8000-000000000003";
const RECORD_ID = "30000000-0000-4000-8000-000000000004";
const FILE_ID = "30000000-0000-4000-8000-000000000005";

function storedFile(overrides: Partial<RecordFileDetails> = {}): RecordFileDetails {
  return {
    id: FILE_ID,
    typeId: TYPE_ID,
    fieldId: FIELD_ID,
    recordId: RECORD_ID,
    storageDriver: "database",
    storageKey: `company/${FILE_ID}/key`,
    name: "Offer.pdf",
    mimeType: "application/pdf",
    size: 10,
    sha256: null,
    status: "ready",
    uploadedById: "30000000-0000-4000-8000-000000000009",
    createdAt: new Date(),
    attachedAt: new Date(),
    detachedAt: null,
    extractionStatus: "pending",
    ...overrides,
  };
}

function service(options: {
  file?: RecordFileDetails | null;
  readable?: boolean;
  visible?: string[];
  listed?: string[];
  record?: boolean;
}) {
  const model = {
    revision: 1,
    types: [{ id: TYPE_ID, archived: false }],
    fields: [{ id: FIELD_ID, typeId: TYPE_ID, archived: false }],
  };
  const record = {
    id: RECORD_ID,
    typeId: TYPE_ID,
    values: [{ fieldId: FIELD_ID, state: "value", textListValue: options.listed ?? [FILE_ID] }],
  };
  return new RecordFileAccessService(
    {
      getModel: () => Promise.resolve(model),
      getRecordCompanyWide: () => Promise.resolve(options.record === false ? null : record),
      getVisibleFields: () => Promise.resolve(new Set(options.visible ?? [FIELD_ID])),
    } as never,
    {
      load: () =>
        Promise.resolve({
          canRead: () => Promise.resolve(options.readable ?? true),
          access: () => new Map(),
        }),
    } as never,
    { getFileCompanyWide: () => Promise.resolve(options.file === undefined ? storedFile() : options.file) },
  );
}

async function refusal(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  const cause = failureUnwindCause(error);
  return cause ? { code: cause.code, kind: cause.failureKind } : error;
}

describe("record file access", () => {
  it("serves a ready file only while its record and field stay readable and list it", async () => {
    await runWithTenant(USER, async () => {
      expect((await service({}).readable(FILE_ID)).id).toBe(FILE_ID);
      expect(await refusal(service({ readable: false }).readable(FILE_ID))).toEqual({
        code: "permissionDenied",
        kind: "authorization",
      });
      expect(await refusal(service({ visible: [] }).readable(FILE_ID))).toEqual({
        code: "permissionDenied",
        kind: "authorization",
      });
      for (const options of [{ listed: [] }, { record: false }, { file: storedFile({ status: "detached" }) }]) {
        expect(await refusal(service(options).readable(FILE_ID))).toEqual({
          code: "recordFileNotFound",
          kind: "not_found",
        });
      }
      expect(await refusal(service({ file: null }).readable(FILE_ID))).toEqual({
        code: "recordFileNotFound",
        kind: "not_found",
      });
    });
  });

  it("shows a pending file only to the person who uploaded it", async () => {
    await runWithTenant(USER, async () => {
      const own = storedFile({ status: "pending", recordId: null, uploadedById: USER.id });
      expect((await service({ file: own }).readable(FILE_ID)).status).toBe("pending");
      const foreign = storedFile({ status: "pending", recordId: null });
      expect(await refusal(service({ file: foreign }).readable(FILE_ID))).toEqual({
        code: "recordFileNotFound",
        kind: "not_found",
      });
    });
  });
});
