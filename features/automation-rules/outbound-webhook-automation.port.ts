import type { WebhookTransport } from "@/features/webhook/webhook-transport.service";
import type { AutomationWebhookPort, AutomationWebhookResult } from "./automation-ports";
import type { AutomationRuleRepo } from "./automation-rule.repo";

import { parseStoredWebhookHeaders } from "@/features/webhook/webhook-headers";

export class OutboundWebhookAutomationPort implements AutomationWebhookPort {
  constructor(
    private readonly repo: Pick<AutomationRuleRepo, "findOutboundWebhookUnscoped">,
    private readonly transport: Pick<WebhookTransport, "post">,
    private readonly plans: { deliversWebhooks(companyId: string): Promise<boolean> },
  ) {}

  async send(input: {
    companyId: string;
    webhookId: string;
    deliveryId: string;
    payload: Record<string, unknown>;
  }): Promise<AutomationWebhookResult> {
    if (!(await this.plans.deliversWebhooks(input.companyId))) return { sent: false, reason: "plan" };
    const webhook = await this.repo.findOutboundWebhookUnscoped(input.companyId, input.webhookId);
    if (!webhook) return { sent: false, reason: "missing" };
    if (!webhook.enabled) return { sent: false, reason: "disabled" };
    const result = await this.transport.post({
      deliveryId: input.deliveryId,
      url: webhook.url,
      secret: webhook.secret,
      headers: parseStoredWebhookHeaders(webhook.headers),
      bodyTemplate: null,
      requestBody: input.payload,
    });
    return { sent: result.success, statusCode: result.statusCode };
  }
}
