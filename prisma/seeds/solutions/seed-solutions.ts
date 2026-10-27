import type { PrismaClient } from "@/generated/prisma";
import type { RecordModel } from "@/features/records/record-model.schema";

import type { SeedContext } from "../context";
import { resetOutdatedSyntheticWorkspace } from "../records";
import { solutionContent, type SolutionContent } from "./define-solution";
import { SOLUTION_DEFINITIONS } from "./definitions";
import { seedSolutionWorkspace, type SolutionSeedCounts } from "./seed-solution";
import { buildSolutionModel } from "./solution-model";
import { SOLUTION_WORKSPACES, type SolutionWorkspace } from "./solution-workspaces";

/** Workspaces seeded at the same time; each holds a few short transactions. */
export const SOLUTION_SEED_CONCURRENCY = 3;

/** Upper bound for seeding every demo workspace; a slower run means the seed grew past what a deploy should wait for. */
export const SOLUTION_SEED_BUDGET_MS = 300_000;

export type SolutionWorkspacePlan = { workspace: SolutionWorkspace; content: SolutionContent; model: RecordModel };

export function solutionWorkspacePlan(workspace: SolutionWorkspace): SolutionWorkspacePlan {
  const content = solutionContent(SOLUTION_DEFINITIONS[workspace.solution.id], workspace.locale);
  return { workspace, content, model: buildSolutionModel(workspace.companyId, workspace.locale, content) };
}

export function solutionWorkspacePlans(): SolutionWorkspacePlan[] {
  return SOLUTION_WORKSPACES.map(solutionWorkspacePlan);
}

/** Removes every demo workspace stored on another record model, so it is rebuilt from scratch. */
export async function resetOutdatedSolutionWorkspaces(
  prisma: PrismaClient,
  plans: readonly SolutionWorkspacePlan[],
): Promise<string[]> {
  const reset: string[] = [];
  for (const { workspace, model } of plans)
    if (await resetOutdatedSyntheticWorkspace(prisma, workspace.companyId, model)) reset.push(workspace.slug);
  return reset;
}

export function assertSolutionSeedBudget(durationMs: number, budgetMs = SOLUTION_SEED_BUDGET_MS): void {
  if (durationMs > budgetMs)
    throw new Error(`Seeding the demo workspaces took ${durationMs} ms, over the ${budgetMs} ms budget`);
}

/**
 * Seeds every demo workspace: the team workspace first (other workspaces copy Max's profile from it), then the rest
 * with bounded concurrency. Returns the record counts per workspace and fails when the run exceeds its budget.
 */
export async function seedSolutionWorkspaces(
  context: SeedContext,
  plans: readonly SolutionWorkspacePlan[],
): Promise<SolutionSeedCounts[]> {
  const started = Date.now();
  const [team, ...others] = [...plans].sort((a, b) => Number(b.workspace.team) - Number(a.workspace.team));
  const results: SolutionSeedCounts[] = [];
  if (team) results.push(await seedSolutionWorkspace(context, team.workspace, team.content, team.model));
  const queue = [...others];
  const worker = async () => {
    for (let plan = queue.shift(); plan; plan = queue.shift())
      results.push(await seedSolutionWorkspace(context, plan.workspace, plan.content, plan.model));
  };
  await Promise.all(Array.from({ length: SOLUTION_SEED_CONCURRENCY }, worker));
  assertSolutionSeedBudget(Date.now() - started);
  const order = new Map(plans.map(({ workspace }, index) => [workspace.slug, index]));
  return results.sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0));
}

/** The catalog slug of every demo workspace, for the workspace URL. */
export function solutionWorkspaceSlugs(): Array<{ companyId: string; slug: string }> {
  return SOLUTION_WORKSPACES.map(({ companyId, slug }) => ({ companyId, slug }));
}

/** Gives every demo workspace its catalog slug and returns how many workspaces it changed (none on a rerun). */
export async function assignSolutionWorkspaceSlugs(prisma: PrismaClient): Promise<number> {
  let assigned = 0;
  for (const { companyId, slug } of solutionWorkspaceSlugs()) {
    assigned +=
      await prisma.$executeRaw`UPDATE "Company" SET "slug" = ${slug} WHERE "id" = ${companyId} AND "slug" IS DISTINCT FROM ${slug}`;
  }
  return assigned;
}
