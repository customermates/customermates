import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

export const GetAgentSkillByNameSchema = z.object({
  name: z.string().trim().min(1).max(64),
});
export type GetAgentSkillByNameData = Data<typeof GetAgentSkillByNameSchema>;

export const AgentSkillIdSchema = z.object({ id: z.uuid() });
export type AgentSkillIdData = Data<typeof AgentSkillIdSchema>;

const SkillFields = {
  name: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers, and underscores only"),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(280),
  instructions: z.string().trim().min(1).max(8000),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
};

export const CreateAgentSkillSchema = z.object(SkillFields);
export type CreateAgentSkillData = Data<typeof CreateAgentSkillSchema>;

export const UpdateAgentSkillSchema = z.object({ id: z.uuid(), ...SkillFields });
export type UpdateAgentSkillData = Data<typeof UpdateAgentSkillSchema>;
