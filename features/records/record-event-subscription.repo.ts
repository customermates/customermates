import type { RecordEventSubscriptionDefinition } from "./record-event-subscription.schema";

export abstract class RecordEventSubscriptionRepo {
  abstract findCompanyWide(companyId: string, ids: string[]): Promise<RecordEventSubscriptionDefinition[]>;
  abstract save(
    definition: Omit<RecordEventSubscriptionDefinition, "revision">,
    action: "create" | "update",
    expectedSchemaRevision?: number,
  ): Promise<void>;
  abstract remove(id: string): Promise<void>;
  abstract pause(id: string): Promise<void>;
  abstract resume(id: string): Promise<void>;
}
