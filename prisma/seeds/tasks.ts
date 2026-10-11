import type { SeedContext } from "./context";
import { northwindAt, northwindDataset } from "./northwind-data";
import { northwindUpdatedAt } from "./northwind-history";

export const SYNTHETIC_TASK_NAMES = northwindDataset().tasks.map(({ name }) => name);

const TASK_STATUSES = ["open", "inProgress", "blocked", "onHold", "done", "archived"] as const;
const TASK_PRIORITIES = ["low", "medium", "high"] as const;

/** Index into the task Status options (Open, In Progress, Blocked, On Hold, Done, Archived). */
export const SYNTHETIC_TASK_STATUS_INDEXES = northwindDataset().tasks.map(({ status }) =>
  TASK_STATUSES.indexOf(status),
);

/** Index into the task Priority options (Low, Medium, High). */
export const SYNTHETIC_TASK_PRIORITY_INDEXES = northwindDataset().tasks.map(({ priority }) =>
  TASK_PRIORITIES.indexOf(priority),
);

/** Tasks that have an assignee. */
export const SYNTHETIC_ASSIGNED_TASK_INDEXES = northwindDataset()
  .tasks.filter(({ assigneeKey }) => assigneeKey !== null)
  .map(({ index }) => index);

export type TaskDefinition = readonly [
  name: string,
  contactIndexes: readonly number[],
  organizationIndexes: readonly number[],
  dealIndexes: readonly number[],
  serviceIndexes: readonly number[],
  statusIndex: number,
];

export type TaskFixture = {
  id: string;
  companyId: string;
  name: string;
  relatedUserId: null;
  type: "custom";
  createdAt: Date;
  updatedAt: Date;
};

export type TaskSeedData = {
  taskDefinitions: readonly TaskDefinition[];
  tasks: TaskFixture[];
};

export function seedTasks(context: SeedContext): Promise<TaskSeedData> {
  const dataset = northwindDataset().tasks;
  const taskDefinitions: readonly TaskDefinition[] = dataset.map(
    (task) =>
      [
        task.name,
        task.contactIndexes,
        task.organizationIndexes,
        task.dealIndexes,
        task.serviceIndexes,
        SYNTHETIC_TASK_STATUS_INDEXES[task.index] ?? 0,
      ] as const,
  );
  const tasks = dataset.map(
    (task) =>
      ({
        id: task.id,
        companyId: context.ids.company,
        name: task.name,
        relatedUserId: null,
        type: "custom",
        createdAt: northwindAt(task.createdAtMs),
        updatedAt: northwindUpdatedAt("task", task.id, task.createdAtMs),
      }) satisfies TaskFixture,
  );

  return Promise.resolve({ taskDefinitions, tasks });
}
