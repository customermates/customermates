import { describe, expect, it } from "vitest";

import type { RecordTypeGrant } from "@/generated/prisma";
import type { RecordActor, RecordActorRepo, RecordRepo, StoredRecord } from "../record.repo";
import type { RecordModel } from "../record-model.schema";
import type { RecordMutation } from "../record-query.schema";
import type { RecordCalculationService } from "../record-calculation.service";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { failureUnwindCause } from "@/core/validation/failure-unwind";
import { RecordAccessPolicy, recordAccessForActor } from "../record-access";
import { RecordWriteService } from "../record-write.service";

const COMPANY = "00000000-0000-4000-8000-000000000001";
const TYPE = "00000000-0000-4000-8000-000000000002";
const RECORD = "00000000-0000-4000-8000-000000000003";
const OWNER_FIELD = "00000000-0000-4000-8000-000000000004";
const NAME_FIELD = "00000000-0000-4000-8000-000000000005";
const ADMIN = "00000000-0000-4000-8000-000000000010";
const COLLEAGUE = "00000000-0000-4000-8000-000000000011";
const INACTIVE = "00000000-0000-4000-8000-000000000012";
const ref = { typeId: TYPE, recordId: RECORD };

const stored = {
  id: RECORD,
  companyId: COMPANY,
  typeId: TYPE,
  version: 3,
  protectedKind: null,
  deletedAt: null,
  values: [{ fieldId: OWNER_FIELD, state: "value", textValue: INACTIVE }],
  assignments: [{ userId: INACTIVE }],
} as unknown as StoredRecord;

const records = {
  getRecordCompanyWide: () => Promise.resolve(stored),
  linkedRecordsCompanyWide: () => Promise.resolve([]),
  getTrashedParentCompanyWide: () => Promise.resolve(null),
} as unknown as RecordRepo;

const actors: RecordActorRepo = {
  getCurrentRecordActorCompanyWide: () => Promise.resolve(null),
  findRecordAssigneesCompanyWide: (ids) => Promise.resolve(ids.filter((id) => id !== INACTIVE)),
};

const model = { types: [{ id: TYPE, archived: false }], relationships: [], capabilities: [] } as unknown as RecordModel;

function loadedPolicy(isSystemRole: boolean) {
  const actor: RecordActor = {
    id: ADMIN,
    status: "active",
    role: { id: "role", companyId: COMPANY, isSystemRole, permissions: [] },
  };
  const grants = [
    { companyId: COMPANY, typeId: TYPE, roleId: "role", actions: ["readAll", "create", "update"] },
  ] as unknown as RecordTypeGrant[];
  return recordAccessForActor({ actor, grants, model, records, companyId: COMPANY, userId: ADMIN });
}

const writer = new RecordWriteService(records, new RecordAccessPolicy(actors, records), {} as RecordCalculationService);

async function failureOf(mutation: RecordMutation, isSystemRole = true) {
  try {
    await writer.validateAccess(mutation, loadedPolicy(isSystemRole));
  } catch (error) {
    return failureUnwindCause(error);
  }
  return null;
}

describe("record assignee and member validation", () => {
  it("refuses a newly assigned inactive member as a validation failure on the assignees", async () => {
    expect(
      await failureOf({ action: "create", typeId: TYPE, fields: [], assignedUserIds: [COLLEAGUE, INACTIVE] }),
    ).toEqual({
      kind: "interactorFailure",
      code: CustomErrorCode.recordMemberInactive,
      failureKind: "validation",
      path: ["mutation", "assignedUserIds"],
    });
  });

  it("refuses an inactive member in a member field at that field's position", async () => {
    expect(
      await failureOf({
        action: "create",
        typeId: TYPE,
        fields: [
          { fieldId: NAME_FIELD, value: { kind: "text", value: "Kick-off" } },
          { fieldId: OWNER_FIELD, value: { kind: "member", value: INACTIVE } },
        ],
      }),
    ).toMatchObject({
      code: CustomErrorCode.recordMemberInactive,
      failureKind: "validation",
      path: ["mutation", "fields", 1, "value"],
    });
  });

  it("keeps an inactive member who is already assigned or already set while other values change", async () => {
    expect(
      await failureOf({
        action: "update",
        ref,
        expectedVersion: 3,
        fields: [
          { fieldId: NAME_FIELD, value: { kind: "text", value: "Renamed" } },
          { fieldId: OWNER_FIELD, value: { kind: "member", value: INACTIVE } },
        ],
        assignedUserIds: [INACTIVE, COLLEAGUE],
      }),
    ).toBeNull();
  });

  it("still refuses assigning someone else without the permission to assign others", async () => {
    expect(
      await failureOf({ action: "update", ref, expectedVersion: 3, fields: [], assignedUserIds: [COLLEAGUE] }, false),
    ).toMatchObject({ code: CustomErrorCode.permissionDenied, failureKind: "authorization" });
  });
});
