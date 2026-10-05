import type { EntityType } from "@/generated/prisma";

import type { ContactIdentifierTarget } from "./prisma-activities.repository";

export abstract class ActivityContactRepo {
  abstract resolveContactIdsForEntityTypeCompanyWide(args: {
    entityType: EntityType;
    entityIds?: string[];
    limit: number;
  }): Promise<string[]>;
  abstract findContactIdentifierTargetsCompanyWide(contactIds: string[]): Promise<ContactIdentifierTarget[]>;
}
