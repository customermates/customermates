import {
  SOLUTION_CATALOG,
  SOLUTION_DATA_LOCALES,
  type SolutionCatalogEntry,
  type SolutionDataLocale,
} from "@/core/solutions/solution-catalog";

import { SEED_IDS } from "../context";
import { workspaceFixtureId } from "../helpers";

export type SolutionWorkspace = {
  solution: SolutionCatalogEntry;
  locale: SolutionDataLocale;
  companyId: string;
  slug: string;
  /** Namespace of the workspace's fixture ids in tables whose ids are unique across workspaces. */
  tag: string;
  /** The small-business EN workspace keeps the team, roles, routines, webhooks, trash and agent chats. */
  team: boolean;
  roleId: string;
  memberId: string;
  subscriptionId: string;
};

const TEAM_WORKSPACE = { solution: "smb", locale: "en" } as const;
const FORMER_SECOND_WORKSPACE = { solution: "consultants", locale: "de" } as const;

function workspaceTag(solutionIndex: number, localeIndex: number): string {
  return `5${solutionIndex}${localeIndex}0`;
}

/** Every demo workspace: one per catalog solution and data locale, in catalog order. */
export const SOLUTION_WORKSPACES: readonly SolutionWorkspace[] = SOLUTION_CATALOG.flatMap((solution, solutionIndex) =>
  SOLUTION_DATA_LOCALES.map((locale, localeIndex): SolutionWorkspace => {
    const companyId = solution.companyIds[locale];
    const team = solution.id === TEAM_WORKSPACE.solution && locale === TEAM_WORKSPACE.locale;
    const formerSecond = solution.id === FORMER_SECOND_WORKSPACE.solution && locale === FORMER_SECOND_WORKSPACE.locale;
    const tag = team ? "0000" : workspaceTag(solutionIndex, localeIndex);
    if (team && companyId !== SEED_IDS.company) throw new Error("The small-business workspace must keep its id");
    if (formerSecond && companyId !== SEED_IDS.secondWorkspaceCompany)
      throw new Error("The German consultants workspace must keep its id");
    return {
      solution,
      locale,
      companyId,
      slug: solution.workspaceSlugs[locale],
      tag,
      team,
      roleId: team
        ? SEED_IDS.role
        : formerSecond
          ? SEED_IDS.secondWorkspaceRole
          : workspaceFixtureId("20000000", tag, 1),
      memberId: team
        ? SEED_IDS.user
        : formerSecond
          ? SEED_IDS.maxBergmannSecondWorkspaceUser
          : workspaceFixtureId("30000000", tag, 1),
      subscriptionId: team
        ? SEED_IDS.subscription
        : formerSecond
          ? SEED_IDS.secondWorkspaceSubscription
          : workspaceFixtureId("50000000", tag, 1),
    };
  }),
);

export function findSolutionWorkspace(solutionId: string, locale: SolutionDataLocale): SolutionWorkspace {
  const workspace = SOLUTION_WORKSPACES.find((entry) => entry.solution.id === solutionId && entry.locale === locale);
  if (!workspace) throw new Error(`Unknown demo workspace ${solutionId}/${locale}`);
  return workspace;
}

export const TEAM_SOLUTION_WORKSPACE = findSolutionWorkspace(TEAM_WORKSPACE.solution, TEAM_WORKSPACE.locale);
