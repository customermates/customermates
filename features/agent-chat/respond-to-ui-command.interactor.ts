import { z } from "zod";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { AgentSessionUnavailableError } from "@/core/errors/app-errors";
import { type Data, type Validated } from "@/core/validation/validation.utils";

import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";

export const RespondToUiCommandSchema = z.object({
  conversationId: z.uuid(),
  commandId: z.string().min(1).max(200),
  name: z.enum(["navigate", "highlight_element", "start_tour", "open_workspace_setup"]),
  ok: z.boolean(),
  result: z.string().min(1).max(1000),
});

export type RespondToUiCommandData = Data<typeof RespondToUiCommandSchema>;

@TenantInteractor()
export class RespondToUiCommandInteractor extends AuthenticatedInteractor<RespondToUiCommandData, { resolved: true }> {
  constructor(private repo: PrismaAgentChatRepo) {
    super();
  }

  @Validate(RespondToUiCommandSchema)
  async invoke(data: RespondToUiCommandData): Validated<{ resolved: true }> {
    const conversation = await this.repo.findConversation(data.conversationId);
    if (!conversation) throw new AgentSessionUnavailableError("Conversation not found.");

    await this.repo.recordUiCommandResult(data);
    return { ok: true, data: { resolved: true } };
  }
}
