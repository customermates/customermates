import { BaseGetRepo } from "@/core/base/base-get.repo";
import type { WebhookDeliveryDto } from "./get-webhook-deliveries.interactor";

export abstract class GetWebhookDeliveriesRepo extends BaseGetRepo<WebhookDeliveryDto> {}
