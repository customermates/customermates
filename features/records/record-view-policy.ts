import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import type { DataViewPolicy } from "@/features/data-view/data-view-policy";
import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordSurfaceKeySchema } from "@/core/data-view/data-view-identity.schema";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { activityViewStateValid, activityViewFilters } from "@/ee/messaging/activities/record-activity-view";
import { recordViewStateIsValid } from "./record-view-state";
import { recordSurfaceKey } from "@/core/data-view/data-view-keys";
import { recordColumns } from "./record-columns";
import { resolveRecordPath } from "./record-relationship-path";

export class RecordViewPolicy implements DataViewPolicy {
  constructor(
    private records: RecordRepo,
    private access: RecordAccessPolicy,
  ) {}
  async list() {
    const [model, policy] = await Promise.all([this.records.getModel(), this.access.load()]);
    return model.types
      .filter((type) => !type.archived && !type.embedded && policy.canReadType(type.id))
      .map((type) => ({ surfaceKey: recordSurfaceKey(type.id), label: type.pluralLabel, path: `/records/${type.id}` }));
  }
  async describe(surfaceKey: string) {
    const typeId = surfaceKey.slice(8);
    const [model, policy] = await Promise.all([this.records.getModel(), this.access.load()]);
    const type = model.types.find((type) => type.id === typeId && !type.archived);
    if (!type || !policy.actor || !policy.canReadType(typeId)) return null;
    const relationships = model.relationships.filter(
      (relation) => policy.canReadType(relation.sourceTypeId) && policy.canReadType(relation.targetTypeId),
    );
    return {
      type: {
        ...type,
        relationshipPaths: type.relationshipPaths?.filter(
          (path) => !path.archived && resolveRecordPath(type.id, path.path, { relationships }),
        ),
      },
      fields: model.fields.filter((field) => field.typeId === typeId && !field.archived),
      columns: recordColumns(typeId, { ...model, relationships }),
    };
  }
  async validate(surfaceKey: string, state?: DataViewState): Promise<CustomErrorCode | null> {
    if (surfaceKey === SURFACE.entityTimeline) {
      if (!state) return null;
      if (!activityViewStateValid(state)) return CustomErrorCode.recordValueInvalid;
      for (const filter of activityViewFilters(state.filters ?? [])) {
        if (filter.kind === "record") {
          const invalid = await this.validate(`records:${filter.typeId}`);
          if (invalid) return invalid;
        }
      }
      return null;
    }
    if (!RecordSurfaceKeySchema.safeParse(surfaceKey).success) return CustomErrorCode.recordTypeNotFound;
    const typeId = surfaceKey.slice(8);
    const [model, policy] = await Promise.all([this.records.getModel(), this.access.load()]);
    if (!model.types.some((type) => type.id === typeId && !type.archived)) return CustomErrorCode.recordTypeNotFound;
    if (!policy.actor || !policy.canReadType(typeId)) return CustomErrorCode.permissionDenied;
    if (!state) return null;
    return recordViewStateIsValid(typeId, state, model) ? null : CustomErrorCode.recordValueInvalid;
  }
}
