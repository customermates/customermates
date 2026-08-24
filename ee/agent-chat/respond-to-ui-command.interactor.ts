import { z } from "zod";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { type Data, type Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";
import { createInteractorFailure } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { wakeAgentUiCommand } from "./agent-run-wake";

export const RespondToUiCommandSchema = z.object({
  conversationId: z.uuid(),
  commandId: z.string().min(1).max(200),
  name: z.enum(["navigate", "highlight_element", "start_tour", "click_ui_target", "open_record"]),
  ok: z.boolean(),
  result: z.string().min(1).max(1000),
});

export type RespondToUiCommandData = Data<typeof RespondToUiCommandSchema>;

const OutputSchema = z.object({ resolved: z.literal(true) });

@AllowInDemoMode
@TenantInteractor()
export class RespondToUiCommandInteractor extends AuthenticatedInteractor<RespondToUiCommandData, { resolved: true }> {
  constructor(
    private repo: PrismaAgentChatRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Write({ input: RespondToUiCommandSchema, output: OutputSchema, tx: false })
  async invoke(data: RespondToUiCommandData): Validated<{ resolved: true }> {
    const denied = await this.entitlements.require("agentChat");
    if (denied) return denied;

    const conversation = await this.repo.findConversation(data.conversationId);
    if (!conversation) return createInteractorFailure(CustomErrorCode.agentConversationNotFound, ["conversationId"]);

    await this.repo.recordUiCommandResult(data);
    await wakeAgentUiCommand(data.conversationId, data.commandId);

    return { ok: true as const, data: { resolved: true } };
  }
}
