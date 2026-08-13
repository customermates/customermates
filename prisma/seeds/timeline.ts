const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function timestamp(start: string, index: number, step = 30 * MINUTE): Date {
  return new Date(Date.parse(start) + index * step);
}

function nextDay(createdAt: Date): Date {
  return new Date(createdAt.getTime() + DAY);
}

export const SYNTHETIC_ORGANIZATION_UPDATE_INDEXES = [5, 10, 12, 13] as const;
export const SYNTHETIC_CONTACT_UPDATE_INDEXES = [0, 6, 7, 19, 22, 23, 26] as const;
export const SYNTHETIC_DEAL_UPDATE_INDEXES = [0, 1, 2] as const;
export const SYNTHETIC_TASK_UPDATE_INDEXES = [0, 4, 7, 8, 13] as const;
export const SYNTHETIC_CUSTOM_COLUMN_UPDATE_INDEXES = [2, 5, 6] as const;

const organizationUpdates = new Set<number>(SYNTHETIC_ORGANIZATION_UPDATE_INDEXES);
const contactUpdates = new Set<number>(SYNTHETIC_CONTACT_UPDATE_INDEXES);
const dealUpdates = new Set<number>(SYNTHETIC_DEAL_UPDATE_INDEXES);
const taskUpdates = new Set<number>(SYNTHETIC_TASK_UPDATE_INDEXES);
const customColumnUpdates = new Set<number>(SYNTHETIC_CUSTOM_COLUMN_UPDATE_INDEXES);

export const SYNTHETIC_SEED_TIMELINE = {
  company: {
    createdAt: new Date("2025-08-06T08:00:00.000Z"),
    updatedAt: new Date("2025-08-06T08:00:00.000Z"),
  },
  systemRole: {
    createdAt: new Date("2025-08-06T08:05:00.000Z"),
    updatedAt: new Date("2025-08-06T08:05:00.000Z"),
  },
  customRole: (index: number) => ({
    createdAt: timestamp("2025-08-06T09:30:00.000Z", index),
    updatedAt: timestamp("2025-08-06T09:30:00.000Z", index),
  }),
  user: (index: number) => ({
    createdAt: timestamp("2025-08-07T09:00:00.000Z", index, 8 * 60 * MINUTE),
    updatedAt:
      index === 1
        ? new Date("2025-08-08T09:30:00.000Z")
        : index === 2
          ? new Date("2025-08-08T17:00:00.000Z")
          : timestamp("2025-08-07T09:00:00.000Z", index, 8 * 60 * MINUTE),
  }),
  customColumn: (index: number) => {
    const createdAt = timestamp("2025-08-10T12:00:00.000Z", index, 2 * DAY);
    return {
      createdAt,
      updatedAt: customColumnUpdates.has(index) ? nextDay(createdAt) : createdAt,
    };
  },
  organization: (index: number) => {
    const createdAt = timestamp("2025-09-03T15:00:00.000Z", index, 2 * DAY);
    return {
      createdAt,
      updatedAt: organizationUpdates.has(index) ? nextDay(createdAt) : createdAt,
    };
  },
  contact: (index: number) => {
    const createdAt = timestamp("2025-10-12T09:00:00.000Z", index, 2 * DAY);
    return {
      createdAt,
      updatedAt: contactUpdates.has(index) ? nextDay(createdAt) : createdAt,
    };
  },
  service: (index: number) => ({
    createdAt: timestamp("2025-12-12T09:00:00.000Z", index, 2 * DAY),
    updatedAt: timestamp("2025-12-12T09:00:00.000Z", index, 2 * DAY),
  }),
  deal: (index: number) => {
    const createdAt = timestamp("2026-03-10T09:00:00.000Z", index, 8 * DAY);
    return {
      createdAt,
      updatedAt: dealUpdates.has(index) ? nextDay(createdAt) : createdAt,
    };
  },
  task: (index: number) => {
    const createdAt = timestamp("2026-05-25T09:00:00.000Z", index, 5 * DAY);
    return {
      createdAt,
      updatedAt: taskUpdates.has(index) ? nextDay(createdAt) : createdAt,
    };
  },
  connectedAccount: (index: number) => ({
    createdAt: timestamp("2026-07-20T08:00:00.000Z", index, 4 * DAY),
    updatedAt: timestamp("2026-07-20T08:00:00.000Z", index, 4 * DAY),
  }),
  webhook: {
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    updatedAt: new Date("2026-08-04T14:00:00.000Z"),
  },
  webhookDelivery: (index: number): Date => timestamp("2026-08-01T10:15:00.000Z", index, 5 * 60 * MINUTE),
} as const;
