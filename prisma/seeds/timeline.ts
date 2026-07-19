const MINUTE = 60_000;

function timestamp(start: string, index: number, step = 30 * MINUTE): Date {
  return new Date(Date.parse(start) + index * step);
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
    createdAt: new Date("2026-03-24T08:00:00.000Z"),
    updatedAt: new Date("2026-03-24T08:00:00.000Z"),
  },
  systemRole: {
    createdAt: new Date("2026-03-24T08:05:00.000Z"),
    updatedAt: new Date("2026-03-24T08:05:00.000Z"),
  },
  customRole: (index: number) => ({
    createdAt: timestamp("2026-03-24T09:30:00.000Z", index),
    updatedAt: timestamp("2026-03-24T09:30:00.000Z", index),
  }),
  user: (index: number) => ({
    createdAt: timestamp("2026-03-24T09:00:00.000Z", index, 10 * MINUTE),
    updatedAt:
      index === 1
        ? new Date("2026-03-24T10:30:00.000Z")
        : index === 2
          ? new Date("2026-03-24T11:00:00.000Z")
          : timestamp("2026-03-24T09:00:00.000Z", index, 10 * MINUTE),
  }),
  customColumn: (index: number) => {
    const createdAt = timestamp("2026-03-24T12:00:00.000Z", index);
    return {
      createdAt,
      updatedAt: customColumnUpdates.has(index) ? timestamp("2026-03-25T09:00:00.000Z", index) : createdAt,
    };
  },
  organization: (index: number) => {
    const createdAt = timestamp("2026-03-25T15:00:00.000Z", index);
    return {
      createdAt,
      updatedAt: organizationUpdates.has(index) ? timestamp("2026-03-26T09:00:00.000Z", index) : createdAt,
    };
  },
  contact: (index: number) => {
    const createdAt = timestamp("2026-03-27T09:00:00.000Z", index);
    return {
      createdAt,
      updatedAt: contactUpdates.has(index) ? timestamp("2026-03-28T09:00:00.000Z", index) : createdAt,
    };
  },
  service: (index: number) => ({
    createdAt: timestamp("2026-03-29T09:00:00.000Z", index, 15 * MINUTE),
    updatedAt: timestamp("2026-03-29T09:00:00.000Z", index, 15 * MINUTE),
  }),
  deal: (index: number) => {
    const createdAt = timestamp("2026-03-30T09:00:00.000Z", index);
    return {
      createdAt,
      updatedAt: dealUpdates.has(index) ? timestamp("2026-03-30T15:00:00.000Z", index) : createdAt,
    };
  },
  task: (index: number) => {
    const createdAt = timestamp("2026-03-31T09:00:00.000Z", index);
    return {
      createdAt,
      updatedAt: taskUpdates.has(index) ? timestamp("2026-04-01T09:00:00.000Z", index) : createdAt,
    };
  },
  connectedAccount: (index: number) => ({
    createdAt: timestamp("2026-04-02T08:00:00.000Z", index),
    updatedAt: timestamp("2026-04-02T08:00:00.000Z", index),
  }),
  webhook: {
    createdAt: new Date("2026-04-02T10:00:00.000Z"),
    updatedAt: new Date("2026-04-02T14:00:00.000Z"),
  },
  webhookDelivery: (index: number): Date => timestamp("2026-04-02T10:15:00.000Z", index, 15 * MINUTE),
} as const;
