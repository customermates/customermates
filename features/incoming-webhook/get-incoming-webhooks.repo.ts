import type { IncomingWebhookDto } from "./incoming-webhook.schema";

import { BaseGetRepo } from "@/core/base/base-get.repo";

export abstract class GetIncomingWebhooksRepo extends BaseGetRepo<IncomingWebhookDto> {}
