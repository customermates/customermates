import type { SeedContext } from "./context";
import type { IdentitySeedProfile } from "./identity";

import { SYNTHETIC_AVATAR_PATHS } from "./avatars";
import { SEED_IDS } from "./context";

// Sandbox demo environments whose database must stay empty of business records.
// These deploy from `sandbox/<slug>` branches and expose `<slug>.customermates.com`;
// the seed still provisions identity (one admin, roles, subscription) so the
// environment is signable-in, but skips every synthetic fixture.
const EMPTY_DEMO_REFS = new Set<string>(["sandbox/sell-ai-projects"]);

// Returns true when the current build must seed identity only and leave the CRM empty.
// Keyed on the Vercel branch ref (with a DEMO_EMPTY=1 escape hatch) so the default
// seed path — and every test that runs it without these vars — is untouched.
export function isEmptyDemo(): boolean {
  if (process.env.DEMO_EMPTY === "1") return true;
  const ref = process.env.VERCEL_GIT_COMMIT_REF?.trim();
  return ref !== undefined && EMPTY_DEMO_REFS.has(ref);
}

// The lone workspace member for an empty demo: Julian Wagner as Admin. Reuses the
// primary seed user's id and credential-account id (and the Admin system role) so
// the proven login wiring is preserved — only the name and email change.
export const EMPTY_DEMO_ADMIN = {
  email: "julian.wagner@customermates.com",
  firstName: "Julian",
  lastName: "Wagner",
  name: "Julian Wagner",
} as const;

export const EMPTY_DEMO_IDENTITY_PROFILE: IdentitySeedProfile = {
  authIdentities: [
    {
      avatarPath: SYNTHETIC_AVATAR_PATHS.maxBergmann,
      credentialAccountId: SEED_IDS.maxBergmannCredentialAccount,
      email: EMPTY_DEMO_ADMIN.email,
      name: EMPTY_DEMO_ADMIN.name,
      userId: SEED_IDS.user,
    },
  ],
  members: [
    {
      id: SEED_IDS.user,
      agreeToTerms: true,
      avatarPath: SYNTHETIC_AVATAR_PATHS.maxBergmann,
      country: "de",
      email: EMPTY_DEMO_ADMIN.email,
      firstName: EMPTY_DEMO_ADMIN.firstName,
      lastName: EMPTY_DEMO_ADMIN.lastName,
      roleId: SEED_IDS.role,
      status: "active",
    },
  ],
};

// Wipe everything a prior deploy (or manual testing) may have left behind, so an
// empty-demo build always converges to a clean, single-admin workspace.
// Every Company relation is `onDelete: Cascade`, so deleting the company row
// removes all business records, custom fields/columns, widgets, roles, app users,
// and the subscription in one step. AuthUser rows are not company-scoped by FK, so
// the extra login users are dropped explicitly (their sessions/accounts cascade);
// the primary login (SEED_IDS.user) is kept and re-seeded as Julian afterwards.
export async function purgeToEmptyDemo(context: SeedContext): Promise<void> {
  const { prisma, ids } = context;

  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.authUser.deleteMany({
    where: { id: { in: [ids.sofiaRossiUser, ids.elenaHoffmannUser] } },
  });
}
