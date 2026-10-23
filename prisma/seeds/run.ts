import type { SeedContext } from "./context";
import type { SolutionSeedCounts } from "./solutions/seed-solution";

import { seedAgentConversations } from "./agent-chat";
import { seedSyntheticAuditEvents } from "./audit-events";
import {
  seedHostedAiOperatorFixtures,
  seedHostedAiOperatorUserTableFixtures,
  seedLocalHostedAiOperatorAccess,
} from "./hosted-ai-operator";
import { seedIdentity } from "./identity";
import { initializeOperatorFixtureModels } from "./records";
import {
  assignSolutionWorkspaceSlugs,
  resetOutdatedSolutionWorkspaces,
  seedSolutionWorkspaces,
  solutionWorkspacePlans,
} from "./solutions/seed-solutions";
import { seedTrash } from "./trash";

export type SyntheticSeedReport = { reset: string[]; slugsAssigned: number; workspaces: SolutionSeedCounts[] };

/**
 * Seeds the demo: one workspace per solution and data locale for Max Bergmann, plus the team fixtures of the
 * small-business workspace (members, roles, Trash, audit history and agent chats) and the hosted
 * AI operator fixtures. Every step is idempotent.
 */
export async function runSyntheticSeed(
  context: SeedContext,
  options: { includeLocalOperatorAccess?: boolean } = {},
): Promise<SyntheticSeedReport> {
  const plans = solutionWorkspacePlans();
  const reset = await resetOutdatedSolutionWorkspaces(context.prisma, plans);

  await seedIdentity(context);
  await seedHostedAiOperatorFixtures(context);
  if (options.includeLocalOperatorAccess) await seedLocalHostedAiOperatorAccess(context);
  await seedHostedAiOperatorUserTableFixtures(context, options);
  await initializeOperatorFixtureModels(context);

  const workspaces = await seedSolutionWorkspaces(context, plans);
  const slugsAssigned = await assignSolutionWorkspaceSlugs(context.prisma);

  await seedTrash(context);
  await seedSyntheticAuditEvents(context);
  await seedAgentConversations(context);
  await context.prisma
    .$executeRaw`SELECT setval(pg_get_serial_sequence('"AgentMessage"', 'sequence'), (SELECT COALESCE(MAX(sequence), 1) FROM "AgentMessage"))`;

  return { reset, slugsAssigned, workspaces };
}
