import type { IncomingWebhookRepo } from "@/features/incoming-webhook/incoming-webhook.repo";
import type { PublicFormRepo } from "@/features/public-form/public-form.repo";

export type PublicEndpointsHandOver = { companyId: string; fromUserIds: string[]; toUserId: string };

export type PublicEndpointsHandOverResult = { forms: number; webhooks: number };

export class HandOverPublicEndpointsService {
  constructor(
    private readonly forms: Pick<PublicFormRepo, "reassignCreatorUnscoped">,
    private readonly webhooks: Pick<IncomingWebhookRepo, "reassignCreatorUnscoped">,
  ) {}

  async invoke(args: PublicEndpointsHandOver): Promise<PublicEndpointsHandOverResult> {
    const fromUserIds = args.fromUserIds.filter((id) => id !== args.toUserId);
    if (fromUserIds.length === 0) return { forms: 0, webhooks: 0 };
    const handOver = { companyId: args.companyId, fromUserIds, toUserId: args.toUserId };
    const [forms, webhooks] = await Promise.all([
      this.forms.reassignCreatorUnscoped(handOver),
      this.webhooks.reassignCreatorUnscoped(handOver),
    ]);
    return { forms, webhooks };
  }
}
