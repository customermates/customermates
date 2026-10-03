export const EntityType = {
  contact: "contact",
  organization: "organization",
  deal: "deal",
  service: "service",
  task: "task",
} as const;

export type EntityType = (typeof EntityType)[keyof typeof EntityType];

export const TaskType = {
  userPendingAuthorization: "userPendingAuthorization",
  custom: "custom",
} as const;

export type TaskType = (typeof TaskType)[keyof typeof TaskType];

export const AggregationType = {
  count: "count",
  dealValue: "dealValue",
  dealQuantity: "dealQuantity",
  dealWeightedValue: "dealWeightedValue",
} as const;

export type AggregationType = (typeof AggregationType)[keyof typeof AggregationType];

export const WidgetGroupByType = {
  contact: "contact",
  organization: "organization",
  deal: "deal",
  service: "service",
  customColumn: "customColumn",
  none: "none",
} as const;

export type WidgetGroupByType = (typeof WidgetGroupByType)[keyof typeof WidgetGroupByType];
