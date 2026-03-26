import type { ChipColor } from "@/constants/chip-colors";

import { WebhookDeliveryStatus } from "@/generated/prisma";

export const WEBHOOK_DELIVERY_QUEUE_STATUS_CHIP_COLOR: Record<WebhookDeliveryStatus, ChipColor> = {
  [WebhookDeliveryStatus.success]: "success",
  [WebhookDeliveryStatus.pending]: "warning",
  [WebhookDeliveryStatus.processing]: "warning",
  [WebhookDeliveryStatus.failed]: "danger",
};
