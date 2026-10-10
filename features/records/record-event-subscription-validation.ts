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
): { trigger: T; emptied: boolean } {
  const changedFieldIds = trigger.changedFieldIds.filter((id) =>
    model.fields.some((field) => field.id === id && !field.archived),
  );
  return {
    trigger: { ...trigger, changedFieldIds, query: trigger.query && keepValidQueryParts(trigger.query, model) },
    emptied: trigger.changedFieldIds.length > 0 && changedFieldIds.length === 0,
  };
}

export function cleanRecordEventSubscription(
  subscription: RecordEventSubscriptionDefinition,
  model: RecordModel,
): { subscription: RecordEventSubscriptionDefinition; paused: boolean } {
  const pause = (kept: RecordEventSubscriptionDefinition) => ({
    subscription: { ...kept, enabled: false },
    paused: true,
  });
  if (subscription.sources?.length) {
    const sources = subscription.sources.flatMap((source) => {
      const cleaned = cleanTrigger(source, model);
      return cleaned.emptied ? [] : [cleaned.trigger];
    });
    if (!sources.length)
      return pause({ ...subscription, sources: null, typeId: null, query: null, changedFieldIds: [] });
    const events = subscription.events.filter((event) => sources.some((source) => source.events.includes(event)));
    const cleaned = { ...subscription, sources, events };
    return recordEventSubscriptionIsValid(cleaned, model)
      ? { subscription: cleaned, paused: false }
      : pause({ ...subscription, sources: null, typeId: null, query: null, changedFieldIds: [] });
  }
  const cleaned = cleanTrigger(subscription, model);
  if (cleaned.emptied || !recordEventSubscriptionIsValid(cleaned.trigger, model)) {
    return pause(
      recordEventSubscriptionIsValid(cleaned.trigger, model)
        ? cleaned.trigger
        : { ...cleaned.trigger, typeId: null, query: null, changedFieldIds: [] },
    );
  }
  return { subscription: cleaned.trigger, paused: false };
}
