import type { RecordModel } from "./record-model.schema";
import type { RecordEventSubscriptionDefinition } from "./record-event-subscription.schema";
import { RecordQuerySchema } from "./record-query.schema";
import { invalidRecordQueryPart, keepValidQueryParts } from "./record-query-validation";

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

function cleanTrigger<T extends { changedFieldIds: string[]; query: { typeId: string } | null }>(
  trigger: T,
  model: RecordModel,
): T | null {
  const changedFieldIds = trigger.changedFieldIds.filter((id) =>
    model.fields.some((field) => field.id === id && !field.archived),
  );
  if (trigger.changedFieldIds.length && !changedFieldIds.length) return null;
  return { ...trigger, changedFieldIds, query: trigger.query && keepValidQueryParts(trigger.query, model) };
}

export function cleanRecordEventSubscription(
  subscription: RecordEventSubscriptionDefinition,
  model: RecordModel,
): RecordEventSubscriptionDefinition | null {
  if (subscription.sources?.length) {
    const sources = subscription.sources.flatMap((source) => cleanTrigger(source, model) ?? []);
    if (!sources.length) return null;
    const events = subscription.events.filter((event) => sources.some((source) => source.events.includes(event)));
    const cleaned = { ...subscription, sources, events };
    return recordEventSubscriptionIsValid(cleaned, model) ? cleaned : null;
  }
  const cleaned = cleanTrigger(subscription, model);
  return cleaned && recordEventSubscriptionIsValid(cleaned, model) ? cleaned : null;
}
