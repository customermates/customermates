import { z } from "zod";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AgentSessionUnavailableError } from "@/core/errors/app-errors";
import { type Data, type Validated } from "@/core/validation/validation.utils";

import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";

export const RespondToUiCommandSchema = z.object({
  conversationId: z.uuid(),
  commandId: z.string().min(1).max(200),
  name: z.enum(["navigate", "highlight_element", "start_tour", "configure_view", "open_record", "fill_form"]),
  ok: z.boolean(),
  result: z.string().min(1).max(1000),
});

export type RespondToUiCommandData = Data<typeof RespondToUiCommandSchema>;

const OutputSchema = z.object({ resolved: z.literal(true) });

@TenantInteractor()
export class RespondToUiCommandInteractor extends AuthenticatedInteractor<RespondToUiCommandData, { resolved: true }> {
  constructor(private repo: PrismaAgentChatRepo) {
    super();
  }

  @Write({ input: RespondToUiCommandSchema, output: OutputSchema, tx: false })
  async invoke(data: RespondToUiCommandData): Validated<{ resolved: true }> {
    const conversation = await this.repo.findConversation(data.conversationId);
    if (!conversation) throw new AgentSessionUnavailableError("Conversation not found.");

    await this.repo.recordUiCommandResult(data);
    return { ok: true, data: { resolved: true } };
  }
}
