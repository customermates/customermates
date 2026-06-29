import { tool } from "ai";
import { z } from "zod";

import { getGetAgentSkillByNameInteractor } from "@/core/di";

export const SKILL_TOOL_NAME = "get_skill";

/**
 * Progressive-disclosure tool: the system prompt lists a compact catalog of the
 * workspace's workflow skills (name + summary); the agent calls this to pull the
 * full step-by-step instructions for one skill only when a request matches it.
 */
export const skillTool = tool({
  description:
    "Load the full step-by-step instructions for one of the workspace's workflow skills, by its `name` from the " +
    "'Available workflow skills' catalog in your system prompt. Call this when the user's request matches a listed " +
    "skill, then follow the returned steps.",
  inputSchema: z.object({
    name: z.string().min(1).describe("The skill's name exactly as listed in the catalog"),
  }),
  execute: async ({ name }: { name: string }) => {
    const result = await getGetAgentSkillByNameInteractor().invoke({ name });
    if (!result.ok || !result.data)
      return `No skill named "${name}". Check the catalog in your system prompt for valid skill names.`;

    return `# ${result.data.title}\n\n${result.data.instructions}`;
  },
});
