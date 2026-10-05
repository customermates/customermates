import { type WebhookDto } from "./webhook.schema";
import { BaseGetRepo } from "@/core/base/base-get.repo";

export abstract class GetWebhooksRepo extends BaseGetRepo<WebhookDto> {}
