import type { SeedContext } from "./context";
import type { IdentitySeedProfile } from "./identity";

import { SEED_IDS } from "./context";

// Sandbox demo environments whose database must stay empty of business records.
// These deploy from `sandbox/<slug>` branches and expose `<slug>.customermates.com`.
const EMPTY_DEMO_REFS = new Set<string>(["sandbox/sell-ai-projects"]);

// Returns true when the current build must converge to a single-admin, record-free
// workspace. Keyed on the Vercel branch ref (with a DEMO_EMPTY=1 escape hatch) so the
// default seed path — and every test that runs it without these vars — is untouched.
export function isEmptyDemo(): boolean {
  if (process.env.DEMO_EMPTY === "1") return true;
  const ref = process.env.VERCEL_GIT_COMMIT_REF?.trim();
  return ref !== undefined && EMPTY_DEMO_REFS.has(ref);
}

// The single retained admin for the empty demo is Julian's real Google login. The
// workspace resolves members by email (better-auth authUser.email -> User.email), so
// this address is the stable key preserved across every reseed.
export const EMPTY_DEMO_ADMIN_EMAIL = "julianwagn3r@gmail.com";
const EMPTY_DEMO_ADMIN_FIRST_NAME = "Julian";
const EMPTY_DEMO_ADMIN_LAST_NAME = "Wagner";

// Identity shell with no synthetic logins: seedIdentity still provisions the company,
// roles and subscription, but creates no users — the retained admin is linked
// separately by email in seedEmptyDemoAdmin.
export const EMPTY_DEMO_IDENTITY_SHELL: IdentitySeedProfile = {
  authIdentities: [],
  members: [],
};

// Wipe an empty-demo database down to nothing, keeping only the retained admin's login.
// Returns false (a no-op) when that login is absent, so a misconfigured build never
// deletes the workspace and locks everyone out.
export async function purgeEmptyDemo(context: SeedContext): Promise<boolean> {
  const { prisma, ids } = context;

  const admin = await prisma.authUser.findUnique({
    where: { email: EMPTY_DEMO_ADMIN_EMAIL },
    select: { id: true },
  });
  if (!admin) {
    console.warn(`empty-demo: admin login ${EMPTY_DEMO_ADMIN_EMAIL} not found; skipping reset to avoid lockout.`);
    return false;
  }

  // Every Company relation is onDelete: Cascade, so deleting the company clears all
  // business records, custom fields/columns, widgets, roles, app-user memberships and
  // the subscription in one step.
  await prisma.company.deleteMany({ where: { id: ids.company } });
  // Drop every login except the retained admin (their sessions/accounts cascade). The
  // admin's authUser and its Google credential are kept intact.
  await prisma.authUser.deleteMany({ where: { email: { not: EMPTY_DEMO_ADMIN_EMAIL } } });

  return true;
}

// Link the retained admin as the sole active Admin member of the freshly reseeded
// company. Upsert by email so it works whether the prior membership was cascade-deleted
// with the company or still lingers under another company.
export async function seedEmptyDemoAdmin(context: SeedContext): Promise<void> {
  const { prisma, ids } = context;

  const member = {
    companyId: ids.company,
    firstName: EMPTY_DEMO_ADMIN_FIRST_NAME,
    lastName: EMPTY_DEMO_ADMIN_LAST_NAME,
    roleId: SEED_IDS.role,
    status: "active" as const,
  };

  await prisma.user.upsert({
    where: { email: EMPTY_DEMO_ADMIN_EMAIL },
    update: member,
    create: { email: EMPTY_DEMO_ADMIN_EMAIL, agreeToTerms: true, ...member },
  });
  await prisma.authUser.updateMany({
    where: { email: EMPTY_DEMO_ADMIN_EMAIL },
    data: { companyId: ids.company, name: `${EMPTY_DEMO_ADMIN_FIRST_NAME} ${EMPTY_DEMO_ADMIN_LAST_NAME}` },
  });
}
