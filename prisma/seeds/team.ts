import { SEED_IDS } from "./context";
import { fixtureId } from "./helpers";

/**
 * The team of the small-business demo workspace (`SEED_IDS.company`). The first three members keep their historical
 * ids and sign-in identities; the other demo workspaces have Max Bergmann as their only member.
 */
export const TEAM_MEMBER_IDS = {
  maxBergmann: SEED_IDS.user,
  sofiaRossi: SEED_IDS.sofiaRossiUser,
  elenaHoffmann: SEED_IDS.elenaHoffmannUser,
  claraNeumann: fixtureId("30000000", 5),
  marcoSilva: fixtureId("30000000", 6),
  kianRahimi: fixtureId("30000000", 7),
  lauraFischer: fixtureId("30000000", 8),
} as const;

export type TeamMemberKey = keyof typeof TEAM_MEMBER_IDS;

export const TEAM_MEMBER_TITLES = {
  maxBergmann: "Managing director",
  sofiaRossi: "Head of sales",
  elenaHoffmann: "Client care lead",
  claraNeumann: "Account manager",
  marcoSilva: "Account manager",
  kianRahimi: "Service coordinator",
  lauraFischer: "Office and operations",
} as const satisfies Record<TeamMemberKey, string>;

/** Roles: Admin (system), Sales lead, Customer success, Account executive, Support, Operations. */
export const TEAM_ROLE_IDS = {
  admin: SEED_IDS.role,
  salesLead: SEED_IDS.salesManagerRole,
  customerSuccess: SEED_IDS.customerSuccessRole,
  accountExecutive: fixtureId("20000000", 5),
  support: fixtureId("20000000", 6),
  operations: fixtureId("20000000", 7),
} as const;

export const TEAM_MEMBER_ROLES = {
  maxBergmann: TEAM_ROLE_IDS.admin,
  sofiaRossi: TEAM_ROLE_IDS.salesLead,
  elenaHoffmann: TEAM_ROLE_IDS.customerSuccess,
  claraNeumann: TEAM_ROLE_IDS.accountExecutive,
  marcoSilva: TEAM_ROLE_IDS.accountExecutive,
  kianRahimi: TEAM_ROLE_IDS.support,
  lauraFischer: TEAM_ROLE_IDS.operations,
} as const satisfies Record<TeamMemberKey, string>;

/** Days before the story end each member joined the small-business workspace. */
export const TEAM_MEMBER_JOINED_DAYS_AGO = {
  maxBergmann: 540,
  sofiaRossi: 520,
  elenaHoffmann: 470,
  claraNeumann: 400,
  marcoSilva: 330,
  kianRahimi: 260,
  lauraFischer: 200,
} as const satisfies Record<TeamMemberKey, number>;
