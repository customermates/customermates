import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

export const GetAgentConversationSchema = z.object({ id: z.uuid() });
export type GetAgentConversationData = Data<typeof GetAgentConversationSchema>;

export const DeleteAgentConversationSchema = z.object({ id: z.uuid() });
export type DeleteAgentConversationData = Data<typeof DeleteAgentConversationSchema>;

export const RenameAgentConversationSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(200),
});
export type RenameAgentConversationData = Data<typeof RenameAgentConversationSchema>;

export const SetPreAuthorizedToolsSchema = z.object({
  toolNames: z.array(z.string().min(1)).max(200).default([]),
});
export type SetPreAuthorizedToolsData = Data<typeof SetPreAuthorizedToolsSchema>;
