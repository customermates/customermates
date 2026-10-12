import type { RecordEventSubscription } from "@/generated/prisma";
import type { RecordEventSubscriptionDefinition } from "./record-event-subscription.schema";

export abstract class RecordSubscriptionConfigurationRepo {
  abstract getPageCompanyWide(companyId: string, afterId?: string): Promise<RecordEventSubscription[]>;
  abstract rewriteCompanyWide(companyId: string, subscription: RecordEventSubscriptionDefinition): Promise<void>;
}
