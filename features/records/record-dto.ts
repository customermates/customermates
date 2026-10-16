import type { RecordRepo, StoredRecord } from "./record.repo";
import type { RecordDto, RecordModel } from "./record-model.schema";
import type { RecordReadScope } from "./record-query.schema";

import { decodeRecordValue } from "./record-storage";

export function recordDto(
  record: StoredRecord,
  model: RecordModel,
  visible: Set<string>,
  memberScope: RecordReadScope,
  selected?: string[],
): RecordDto {
  return {
    ref: { typeId: record.typeId, recordId: record.id },
    version: record.version,
    ...(record.protectedKind === "membershipAuthorization" ? { protectedKind: record.protectedKind } : {}),
    schemaRevision: model.revision,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    assignedUserIds: record.assignments.map((assignment) => assignment.userId),
    assignedUsers: record.assignments.flatMap((assignment) =>
      assignment.user &&
      (memberScope.access === "all" || (memberScope.access === "own" && assignment.userId === memberScope.userId))
        ? [assignment.user]
        : [],
    ),
    memberUsers: [],
    relationships: [],
    fields: model.fields
      .filter(
        (field) =>
          field.typeId === record.typeId &&
          !field.archived &&
          field.valueType !== "channels" &&
          (!selected || selected.includes(field.id)),
      )
      .map((field) => ({
        fieldId: field.id,
        result: visible.has(field.id)
          ? decodeRecordValue(
              record.values.find((value) => value.fieldId === field.id),
              field,
            )
          : { state: "restricted" },
      })),
  };
}

function memberIds(record: RecordDto) {
  return record.fields.flatMap(({ result }) =>
    result.state === "value" && result.value.kind === "member" ? [result.value.value] : [],
  );
}

function fileIds(record: RecordDto) {
  return record.fields.flatMap(({ result }) =>
    result.state === "value" && result.value.kind === "file" ? result.value.value : [],
  );
}

export async function withRecordFiles<T extends RecordDto>(
  records: T[],
  repo: Pick<RecordRepo, "getRecordFilesCompanyWide">,
): Promise<T[]> {
  const ids = [...new Set(records.flatMap(fileIds))];
  if (!ids.length) return records;
  const files = new Map((await repo.getRecordFilesCompanyWide(ids)).map((file) => [file.id, file]));
  return records.map((record) => {
    const own = [...new Set(fileIds(record))].flatMap((id) => {
      const file = files.get(id);
      return file ? [file] : [];
    });
    return own.length ? { ...record, files: own } : record;
  });
}

export async function withMemberUsers<T extends RecordDto>(
  records: T[],
  repo: Pick<RecordRepo, "getMembersCompanyWide">,
  memberScope: RecordReadScope,
): Promise<T[]> {
  const readable = [...new Set(records.flatMap(memberIds))].filter(
    (id) => memberScope.access === "all" || (memberScope.access === "own" && id === memberScope.userId),
  );
  if (!readable.length) return records;
  const users = new Map((await repo.getMembersCompanyWide(readable)).map((user) => [user.id, user]));
  return records.map((record) => ({
    ...record,
    memberUsers: [...new Set(memberIds(record))].flatMap((id) => {
      const user = users.get(id);
      return user ? [user] : [];
    }),
  }));
}
