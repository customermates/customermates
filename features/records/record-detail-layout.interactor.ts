import { getTranslations } from "next-intl/server";
import type { z } from "zod";
import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { RecordModel } from "./record-model.schema";
import type { GetP13nRepo } from "@/features/p13n/get-p13n.interactor";
import type { UpsertP13nRepo } from "@/features/p13n/upsert-p13n.interactor";
import type { Validated } from "@/core/validation/validation.utils";
import type { RecordDetailLayoutResult, SaveRecordDetailLayoutInput } from "./record-detail-layout.schema";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { fail, failNotFound, failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { recordColumns } from "./record-columns";
import { recordDetailLayoutIsValid, storedRecordDetailLayout } from "./record-detail-layout";
import {
  ReadRecordDetailLayoutSchema,
  SaveRecordDetailLayoutSchema,
  recordDetailKey,
} from "./record-detail-layout.schema";
import { recordRequestHash } from "./mutate-record.interactor";
import { resolveRecordPath } from "./record-relationship-path";

type Policy = Awaited<ReturnType<RecordAccessPolicy["load"]>>;

export class RecordDetailLayoutReader {
  constructor(private personalization: GetP13nRepo) {}

  async read(typeId: string, model: RecordModel, policy: Policy): Validated<RecordDetailLayoutResult> {
    const type = model.types.find((type) => type.id === typeId && !type.archived);
    if (!type || !policy.actor || (!policy.allowed(typeId, "readAll") && !policy.allowed(typeId, "readOwn")))
      return failNotFound(CustomErrorCode.recordTypeNotFound);
    const relationships = model.relationships.filter(
      (relation) =>
        (policy.allowed(relation.sourceTypeId, "readAll") || policy.allowed(relation.sourceTypeId, "readOwn")) &&
        (policy.allowed(relation.targetTypeId, "readAll") || policy.allowed(relation.targetTypeId, "readOwn")),
    );
    const visibleType = {
      ...type,
      relationshipPaths: type.relationshipPaths?.filter(
        (path) => !path.archived && resolveRecordPath(typeId, path.path, { relationships }),
      ),
    };
    const columns = recordColumns(typeId, { ...model, types: [visibleType], relationships });
    const [stored, t] = await Promise.all([this.personalization.getP13n(recordDetailKey(typeId)), getTranslations()]);
    const personal = storedRecordDetailLayout(stored);
    const layout = personal ?? { pinnedFields: type.defaults.pinnedFields, hiddenFields: [], fieldOrder: [] };
    const available = new Set(columns.map((column) => column.id));
    return {
      ok: true,
      data: {
        typeId,
        schemaRevision: model.revision,
        hasPersonalization: personal !== null,
        layout: {
          pinnedFields: layout.pinnedFields.filter((id) => available.has(id)),
          hiddenFields: layout.hiddenFields.filter((id) => available.has(id)),
          fieldOrder: layout.fieldOrder.filter((id) => available.has(id)),
        },
        fields: columns.map((column) => ({
          id: column.id,
          label:
            column.kind === "identity"
              ? t("EntityChannels.heading")
              : column.kind === "system"
                ? t(`RecordModel.${column.label}`)
                : column.label,
        })),
      },
    };
  }
}

@AllowInDemoMode
@TenantInteractor()
export class ReadRecordDetailLayoutInteractor extends AuthenticatedInteractor<
  z.infer<typeof ReadRecordDetailLayoutSchema>,
  RecordDetailLayoutResult
> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private reader: RecordDetailLayoutReader,
  ) {
    super();
  }

  @Validate(ReadRecordDetailLayoutSchema)
  async invoke(input: z.infer<typeof ReadRecordDetailLayoutSchema>): Validated<RecordDetailLayoutResult> {
    return runInTransaction(
      async () => {
        const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        return this.reader.read(input.typeId, model, policy);
      },
      { readOnly: true },
    );
  }
}

@TenantInteractor()
export class SaveRecordDetailLayoutInteractor extends AuthenticatedInteractor<
  SaveRecordDetailLayoutInput,
  RecordDetailLayoutResult
> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private personalization: UpsertP13nRepo,
    private reader: RecordDetailLayoutReader,
  ) {
    super();
  }

  @Validate(SaveRecordDetailLayoutSchema)
  async invoke(input: SaveRecordDetailLayoutInput): Validated<RecordDetailLayoutResult> {
    return runInTransaction(async () => {
      const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
      const type = model.types.find((type) => type.id === input.typeId && !type.archived);
      if (!type || !policy.actor || (!policy.allowed(type.id, "readAll") && !policy.allowed(type.id, "readOwn")))
        return failNotFound(CustomErrorCode.recordTypeNotFound);
      const hash = recordRequestHash({ operation: "saveRecordDetailLayout", ...input });
      const receipt = await this.records.receipt(input.idempotencyKey, this.userId);
      if (receipt) {
        return receipt.requestHash === hash
          ? this.reader.read(type.id, model, policy)
          : failConflict(CustomErrorCode.recordIdempotencyConflict);
      }
      if (model.revision !== input.expectedRevision) return failConflict(CustomErrorCode.recordSchemaChanged);
      if ((await this.records.getState())?.activeOperationId) return failConflict(CustomErrorCode.recordWritePaused);
      if (input.layout && !recordDetailLayoutIsValid(type.id, input.layout, model))
        return fail(CustomErrorCode.recordValueInvalid, ["layout"]);
      const current = await this.reader.read(type.id, model, policy);
      if (!current.ok) return current;
      const available = new Set(current.data.fields.map((field) => field.id));
      if (input.layout && Object.values(input.layout).some((keys) => keys.some((key) => !available.has(key))))
        return fail(CustomErrorCode.recordValueInvalid, ["layout"]);
      await this.personalization.upsertP13n({
        p13nId: recordDetailKey(type.id),
        detailOptions: input.layout
          ? {
              starredFieldIds: input.layout.pinnedFields,
              hiddenFieldIds: input.layout.hiddenFields,
              fieldOrder: input.layout.fieldOrder,
              collapsedSectionIds: [],
            }
          : null,
        columnOrder: null,
      });
      const result = await this.reader.read(type.id, model, policy);
      if (!result.ok) return result;
      await this.records.saveReceipt(input.idempotencyKey, this.userId, hash, result.data);
      return result;
    });
  }
}
