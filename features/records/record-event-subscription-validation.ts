import type { RecordModel } from "./record-model.schema";
import type { RecordEventSubscriptionDefinition } from "./record-event-subscription.schema";
import { RecordQuerySchema } from "./record-query.schema";
import { invalidRecordQueryPart } from "./record-query-validation";

export function recordEventSubscriptionIsValid(
  subscription: RecordEventSubscriptionDefinition,
  model: RecordModel,
): boolean {
  if (subscription.sources?.length) {
    return subscription.sources.every(
      (source) =>
        model.types.some((type) => type.id === source.query.typeId && !type.archived) &&
        source.changedFieldIds.every((id) =>
          model.fields.some((field) => field.id === id && field.typeId === source.query.typeId && !field.archived),
        ) &&
        !invalidRecordQueryPart(RecordQuerySchema.parse(source.query), model),
    );
  }
  if (subscription.typeId && !model.types.some((type) => type.id === subscription.typeId && !type.archived))
    return false;
  if (
    subscription.changedFieldIds.some(
      (id) => !model.fields.some((field) => field.id === id && field.typeId === subscription.typeId && !field.archived),
    )
  )
    return false;
  return !subscription.query || !invalidRecordQueryPart(RecordQuerySchema.parse(subscription.query), model);
}
