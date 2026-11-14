import { z } from "zod";

export const TEAM_SIZES = ["solo", "small", "medium", "large"] as const;
export type TeamSize = (typeof TEAM_SIZES)[number];

export const TeamSizeSchema = z.enum(TEAM_SIZES);

export function parseTeamSize(value: unknown): TeamSize | null {
  const parsed = TeamSizeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isTeam(teamSize: TeamSize | null | undefined): boolean {
  return teamSize !== null && teamSize !== undefined && teamSize !== "solo";
}
