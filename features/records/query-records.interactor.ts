import { recordChannelsEnabled } from "./record-channels";

import type { RecordRepo, StoredRecord } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { RecordDto, RecordModel } from "./record-model.schema";
import type { RecordQuery, RecordReadScope } from "./record-query.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { fail, failAuthorization, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordQuerySchema } from "./record-query.schema";
import { invalidRecordQueryPart } from "./record-query-validation";
import { decodeRecordValue } from "./record-storage";
import { recordWriteFailure } from "./mutate-record.interactor";
import type { RecordQueryResult } from "./record-query-result.schema";
import { recordGroupableFields } from "./record-grouping";

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
        (field) => field.typeId === record.typeId && !field.archived && (!selected || selected.includes(field.id)),
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

@AllowInDemoMode
@TenantInteractor()
export class QueryRecordsInteractor extends AuthenticatedInteractor<RecordQuery, RecordQueryResult> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }

  @Validate(RecordQuerySchema)
  async invoke(query: RecordQuery): Validated<RecordQueryResult> {
    return runInTransaction(
      async () => {
        const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
        if (!model.types.some((type) => type.id === query.typeId && !type.archived))
          return failNotFound(CustomErrorCode.recordTypeNotFound);
        const access = policy.access(model.types.filter((type) => !type.archived).map((type) => type.id));
        if (access.get(query.typeId)?.access === "none") return failNotFound(CustomErrorCode.recordTypeNotFound);
        const invalid = invalidRecordQueryPart(query, model);
        if (invalid) return fail(CustomErrorCode.recordValueInvalid, [invalid]);
        try {
          const result = await this.records.query(query, model, access, policy.memberScope);
          const identities =
            query.includeIdentities && recordChannelsEnabled(model, query.typeId)
              ? await this.records.getRecordIdentitiesCompanyWide(
                  query.typeId,
                  result.records.map((record) => record.id),
                )
              : null;
          const relationships = await this.records.relationshipSummaries(
            query.typeId,
            result.records.map((record) => record.id),
            query.includeRelationships ?? [],
            model,
            access,
          );
          const groupedField = model.fields.find((field) => field.id === result.grouping?.columnId);
          const paths = await this.records.pathSummaries(
            query.typeId,
            result.records.map((record) => record.id),
            query.includePaths ?? [],
            model,
            access,
          );
          const canMove = recordGroupableFields(query.typeId, model, policy.allowed(query.typeId, "update")).some(
            (field) => field.grouping.field === result.grouping?.grouping.field && field.supportsDragWriteBack,
          );
          return {
            ok: true as const,
            data: {
              records: await withMemberUsers(
                result.records.map((record) => ({
                  ...recordDto(
                    record,
                    model,
                    result.visibleFields.get(record.id) ?? new Set(),
                    policy.memberScope,
                    query.fields,
                  ),
                  ...(identities ? { identities: identities.get(record.id) ?? [] } : {}),
                  relationships: relationships.get(record.id) ?? [],
                  relationshipPaths: paths.get(record.id) ?? [],
                })),
                this.records,
                policy.memberScope,
              ),
              total: result.total,
              page: query.page,
              pageSize: query.pageSize,
              schemaRevision: model.revision,
              ...(result.grouping
                ? {
                    grouping: {
                      ...result.grouping,
                      supportsDragWriteBack: canMove,
                      groups: result.grouping.groups.map((group) => ({
                        ...group,
                        writable:
                          canMove &&
                          Boolean(groupedField) &&
                          (group.isNoValue
                            ? !groupedField?.required
                            : groupedField?.options.some((option) => `value:${option.id}` === group.key)),
                      })),
                    },
                  }
                : {}),
            },
          };
        } catch (error) {
          return recordWriteFailure(error);
        }
      },
      { readOnly: true },
    );
  }
}
