import type { SolutionId } from "./solution-catalog";

import templates from "./solution-templates.json";

export type SolutionTemplate = {
  workspace: string;
  lists: { name: string; fields: string[] }[];
  stages: string[];
  dashboard: string[];
  calendar: string[];
  knowledgeBase: string[];
};

export const SOLUTION_TEMPLATES = templates as Record<SolutionId, SolutionTemplate>;
