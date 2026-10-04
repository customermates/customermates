import { getTranslations } from "next-intl/server";
import type { RecordModel } from "./record-model.schema";
import type { GetP13nRepo } from "@/features/p13n/get-p13n.interactor";
import type { Validated } from "@/core/validation/validation.utils";
import type { RecordDetailLayoutResult } from "./record-detail-layout.schema";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { recordColumns } from "./record-columns";
import { storedRecordDetailLayout } from "./record-detail-layout";
import { recordDetailKey } from "./record-detail-layout.schema";
import { resolveRecordPath } from "./record-relationship-path";
import type { Policy } from "./record-detail-layout.interactor";

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
