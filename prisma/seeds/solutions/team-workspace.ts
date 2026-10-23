import { solutionContent } from "./define-solution";
import smb from "./definitions/smb";

/** The visible content of the team workspace (small business, English data), for the team fixtures built around it. */
export const TEAM_SOLUTION_CONTENT = solutionContent(smb, "en");

export const TEAM_WORKSPACE_NAME = TEAM_SOLUTION_CONTENT.workspaceName;

/** A record of the team workspace by list and key, for fixtures that refer to one. */
export function teamRecord(list: string, key: string) {
  const record = TEAM_SOLUTION_CONTENT.records[list]?.find((entry) => entry.key === key);
  if (!record) throw new Error(`The team workspace has no ${list} ${key}`);
  return record;
}
