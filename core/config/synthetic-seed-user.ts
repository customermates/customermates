import { findSolution } from "@/core/solutions/solution-catalog";

export const SYNTHETIC_COMPANY_USERS = {
  maxBergmann: {
    email: "max.bergmann@customermates.com",
    firstName: "Max",
    lastName: "Bergmann",
    name: "Max Bergmann",
  },
  sofiaRossi: {
    email: "sofia.rossi@customermates.com",
    firstName: "Sofia",
    lastName: "Rossi",
    name: "Sofia Rossi",
  },
  elenaHoffmann: {
    email: "elena.hoffmann@customermates.com",
    firstName: "Elena",
    lastName: "Hoffmann",
    name: "Elena Hoffmann",
  },
} as const;

export const SYNTHETIC_SECOND_WORKSPACE_NAME = "Bergmann Steuern";

export const SYNTHETIC_WORKSPACE_SLUG = findSolution("smb").workspaceSlugs.en;

export const SYNTHETIC_SECOND_WORKSPACE_SLUG = findSolution("consultants").workspaceSlugs.de;

export function fixtureWorkspaceSlug(companyId: string): string {
  return `ws-${companyId.replace(/-/g, "").toLowerCase()}`;
}

export const SYNTHETIC_SHARED_USER_PASSWORD = "local-demo-password";

export const SYNTHETIC_SEED_USER = {
  email: SYNTHETIC_COMPANY_USERS.maxBergmann.email,
  password: SYNTHETIC_SHARED_USER_PASSWORD,
} as const;
