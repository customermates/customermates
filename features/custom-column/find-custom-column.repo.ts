import type { CustomColumnDto } from "./custom-column.schema";

import type { EntityType } from "@/generated/prisma";

export abstract class FindCustomColumnRepo {
  abstract findByEntityType(entityType: EntityType): Promise<CustomColumnDto[]>;
}
