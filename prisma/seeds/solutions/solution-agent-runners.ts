import type { Prisma, PrismaClient } from "@/generated/prisma";

import { workspaceFixtureId } from "../helpers";
import { storyMoment } from "../timeline";
import type { SolutionContent } from "./define-solution";
import type { SolutionWorkspace } from "./solution-workspaces";

const RUNNER_GROUP = "2c300000";

/**
 * Seeds the runners of a demo workspace under Settings, Agents: one machine of Max's that runs agent steps with its
 * command line clients. The token hash is a fixture that no runner can present; runners the workspace no longer has
 * are removed.
 */
export async function seedSolutionAgentRunners(
  prisma: PrismaClient,
  workspace: SolutionWorkspace,
  content: SolutionContent,
): Promise<void> {
  const { companyId, tag } = workspace;
  const runners = (content.runners ?? []).map((spec, index) => {
    const id = workspaceFixtureId(RUNNER_GROUP, tag, index + 1);
    const createdAt = storyMoment(spec.createdDaysAgo);
    const lastSeenAt = storyMoment(0, spec.lastSeenMinutesAgo);
    return {
      id,
      row: {
        companyId,
        name: spec.name,
        tokenHash: `demo-fixture-${tag}-runner-${index + 1}-without-token`,
        machine: spec.machine,
        clients: spec.clients.map((client) => ({
          ...client,
        })) as Prisma.InputJsonValue,
        lastSeenAt,
        revokedAt: null,
        createdById: workspace.memberId,
        createdAt,
        updatedAt: lastSeenAt,
      } satisfies Prisma.AgentRunnerUncheckedCreateInput,
    };
  });

  for (const runner of runners) {
    await prisma.agentRunner.upsert({
      where: { id: runner.id },
      update: runner.row,
      create: { id: runner.id, ...runner.row },
    });
  }

  await prisma.agentRunner.deleteMany({
    where: {
      companyId,
      id: {
        startsWith: `${RUNNER_GROUP}-${tag}-`,
        notIn: runners.map(({ id }) => id),
      },
    },
  });
}
