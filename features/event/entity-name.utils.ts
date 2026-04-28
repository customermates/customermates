import type { DomainEventMap } from "./domain-events";

import { TaskType } from "@/generated/prisma";

import { getSystemTaskNameTranslationKey } from "@/app/[locale]/(protected)/tasks/components/system-task.config";

import { DomainEvent } from "./domain-events";

function getTaskName(task: { name: string; type: TaskType }, translate?: (key: string) => string): string {
  if (task.type !== TaskType.custom && translate) {
    const translationKey = getSystemTaskNameTranslationKey(task.type);
    if (translationKey) return translate(translationKey);
  }
  // System tasks store an empty `name`; fall back to the type so audit log /
  // webhook entityName has a stable identifier when no translator is available.
  return task.name || (task.type !== TaskType.custom ? task.type : "");
}

const entityNameExtractors: {
  [K in DomainEvent]: (eventData: DomainEventMap[K], translate?: (key: string) => string) => string;
} = {
  [DomainEvent.CONTACT_CREATED]: (eventData) => `${eventData.payload.firstName} ${eventData.payload.lastName}`.trim(),
  [DomainEvent.CONTACT_DELETED]: (eventData) => `${eventData.payload.firstName} ${eventData.payload.lastName}`.trim(),
  [DomainEvent.CONTACT_UPDATED]: (eventData) =>
    `${eventData.payload.contact.firstName} ${eventData.payload.contact.lastName}`.trim(),
  [DomainEvent.ORGANIZATION_CREATED]: (eventData) => eventData.payload.name,
  [DomainEvent.ORGANIZATION_DELETED]: (eventData) => eventData.payload.name,
  [DomainEvent.ORGANIZATION_UPDATED]: (eventData) => eventData.payload.organization.name,
  [DomainEvent.DEAL_CREATED]: (eventData) => eventData.payload.name,
  [DomainEvent.DEAL_DELETED]: (eventData) => eventData.payload.name,
  [DomainEvent.DEAL_UPDATED]: (eventData) => eventData.payload.deal.name,
  [DomainEvent.SERVICE_CREATED]: (eventData) => eventData.payload.name,
  [DomainEvent.SERVICE_DELETED]: (eventData) => eventData.payload.name,
  [DomainEvent.SERVICE_UPDATED]: (eventData) => eventData.payload.service.name,
  [DomainEvent.TASK_CREATED]: (eventData, translate) => getTaskName(eventData.payload, translate),
  [DomainEvent.TASK_DELETED]: (eventData, translate) => getTaskName(eventData.payload, translate),
  [DomainEvent.TASK_UPDATED]: (eventData, translate) => getTaskName(eventData.payload.task, translate),
  [DomainEvent.COMPANY_UPDATED]: (eventData) => eventData.payload.name,
  [DomainEvent.USER_UPDATED]: (eventData) => `${eventData.payload.firstName} ${eventData.payload.lastName}`.trim(),
  [DomainEvent.USER_REGISTERED]: (eventData) => `${eventData.payload.firstName} ${eventData.payload.lastName}`.trim(),
  [DomainEvent.ROLE_CREATED]: (eventData) => eventData.payload.name,
  [DomainEvent.ROLE_UPDATED]: (eventData) => eventData.payload.role.name,
  [DomainEvent.ROLE_DELETED]: (eventData) => eventData.payload.name,
  [DomainEvent.WEBHOOK_CREATED]: (eventData) => eventData.payload.url,
  [DomainEvent.WEBHOOK_UPDATED]: (eventData) => eventData.payload.webhook.url,
  [DomainEvent.WEBHOOK_DELETED]: (eventData) => eventData.payload.url,
  [DomainEvent.CUSTOM_COLUMN_CREATED]: (eventData) => eventData.payload.label,
  [DomainEvent.CUSTOM_COLUMN_UPDATED]: (eventData) => eventData.payload.customColumn.label,
  [DomainEvent.CUSTOM_COLUMN_DELETED]: (eventData) => eventData.payload.label,
};

export function getEntityName<E extends DomainEvent>(
  event: E,
  eventData: DomainEventMap[E] | null | undefined,
  translate?: (key: string) => string,
): string {
  if (!eventData) return "";

  try {
    const extractor = entityNameExtractors[event];
    return extractor ? extractor(eventData, translate) : "";
  } catch {
    return "";
  }
}
