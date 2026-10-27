import type { SeedContext } from "./context";

export async function reconcileAuthUserId(context: SeedContext, id: string, email: string): Promise<void> {
  const [existingById, existingByEmail] = await Promise.all([
    context.prisma.authUser.findUnique({ where: { id }, select: { id: true } }),
    context.prisma.authUser.findUnique({ where: { email }, select: { id: true } }),
  ]);

  if (!existingByEmail || existingByEmail.id === id) return;

  if (existingById) await context.prisma.authUser.delete({ where: { id: existingByEmail.id } });
  else await context.prisma.authUser.update({ where: { id: existingByEmail.id }, data: { id } });
}

export type SeedMembershipKey = Readonly<{ companyId: string; email: string }>;

export async function reconcileDomainUserId(
  context: SeedContext,
  id: string,
  { companyId, email }: SeedMembershipKey,
): Promise<void> {
  const [existingById, existingByEmail] = await Promise.all([
    context.prisma.user.findUnique({ where: { id }, select: { id: true } }),
    context.prisma.user.findUnique({ where: { companyId_email: { companyId, email } }, select: { id: true } }),
  ]);

  if (!existingByEmail || existingByEmail.id === id) return;

  if (existingById) {
    // Routine_enabled_requires_owner rejects the SetNull that a delete performs on an enabled routine.
    await context.prisma.routine.updateMany({
      where: { ownerUserId: existingByEmail.id },
      data: { enabled: false, nextRunAt: null, disabledReason: "ownerUnavailable" },
    });
    await context.prisma.user.delete({ where: { id: existingByEmail.id } });
  } else await context.prisma.user.update({ where: { id: existingByEmail.id }, data: { id } });
}

export function fixtureId(group: string, index: number): string {
  return `${group}-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

const FIXTURE_UPSERT_CONCURRENCY = 10;

export async function upsertFixturesById<T extends { id: string }>(
  fixtures: ReadonlyArray<T>,
  upsert: (fixture: T) => Promise<unknown>,
): Promise<void> {
  for (let start = 0; start < fixtures.length; start += FIXTURE_UPSERT_CONCURRENCY) {
    const batch = fixtures.slice(start, start + FIXTURE_UPSERT_CONCURRENCY);
    await Promise.all(batch.map((fixture) => upsert(fixture)));
  }
}

/** A fixture id inside one workspace's namespace, for tables whose ids are unique across workspaces. */
export function workspaceFixtureId(group: string, tag: string, index: number): string {
  return `${group}-${tag}-4000-8000-${String(index).padStart(12, "0")}`;
}
