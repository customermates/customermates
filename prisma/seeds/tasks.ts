import type { Prisma } from "@/generated/prisma";

import type { SeedContext } from "./context";
import { fixtureId, relationshipTargets, upsertFixturesById } from "./helpers";

export const SYNTHETIC_TASK_NAMES = [
  "Prepare and send a proposal for Wavestone",
  "Discuss contract renewal",
  "Review inbound lead from website and assign qualification score",
  "Update training materials",
  "Schedule discovery call with BMW",
  "Coordinate demo appointment",
  "User Pending Authorization (Sofia Rossi)",
  "Follow up with legal on contract approval for Roche",
  "Schedule discovery call with PwC",
  "Follow up on cold call",
  "Prepare kickoff workshop",
  "Review proposal response",
  "Finalize quote",
  "Review follow-up notes from the Roche demo",
  "Loop in legal team",
] as const;

export const SYNTHETIC_TASK_CONTACT_LINKS = [
  [5, 25],
  [9, 6],
  [10, 22],
  [11, 22],
  [12, 25],
] as const;

export const SYNTHETIC_TASK_ORGANIZATION_LINKS = [
  [1, 13],
  [10, 14],
  [12, 14],
] as const;

export const SYNTHETIC_TASK_DEAL_LINKS = [
  [10, 2],
  [11, 2],
  [12, 2],
  [14, 7],
] as const;

export const SYNTHETIC_TASK_SERVICE_LINKS = [[3, 35]] as const;

export const SYNTHETIC_ASSIGNED_TASK_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14] as const;

export const SYNTHETIC_TASK_STATUS_INDEXES = [2, 0, 4, 4, 1, 0, 0, 2, 1, 0, 1, 1, 2, 0, 0] as const;

export const SYNTHETIC_TASK_PRIORITY_INDEXES = [1, 1, 2, 0, 1, 1, 2, 0, 0, 0, 2, 2, 2, 0, 1] as const;

export type TaskDefinition = readonly [
  name: string,
  contactIndexes: readonly number[],
  organizationIndexes: readonly number[],
  dealIndexes: readonly number[],
  serviceIndexes: readonly number[],
  statusIndex: number,
];

export type TaskFixture = Prisma.TaskCreateManyInput & { id: string };

export type TaskSeedData = {
  taskDefinitions: readonly TaskDefinition[];
  tasks: TaskFixture[];
};

export async function seedTasks(context: SeedContext): Promise<TaskSeedData> {
  const taskDefinitions: readonly TaskDefinition[] = SYNTHETIC_TASK_NAMES.map(
    (name, index) =>
      [
        name,
        relationshipTargets(SYNTHETIC_TASK_CONTACT_LINKS, index),
        relationshipTargets(SYNTHETIC_TASK_ORGANIZATION_LINKS, index),
        relationshipTargets(SYNTHETIC_TASK_DEAL_LINKS, index),
        relationshipTargets(SYNTHETIC_TASK_SERVICE_LINKS, index),
        SYNTHETIC_TASK_STATUS_INDEXES[index],
      ] as const,
  );

  const tasks = taskDefinitions.map(
    ([name], index) =>
      ({
        id: fixtureId("a0000000", index + 1),
        companyId: context.ids.company,
        name,
        relatedUserId: index === 6 ? context.ids.pendingUser : context.ids.user,
        type: index === 6 ? "userPendingAuthorization" : "custom",
      }) satisfies Prisma.TaskCreateManyInput,
  );

  await upsertFixturesById(tasks, (task) =>
    context.prisma.task.upsert({
      where: { id: task.id },
      update: task,
      create: task,
    }),
  );

  return { taskDefinitions, tasks };
}
