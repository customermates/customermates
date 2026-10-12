import type { TrashItem as TrashItemRow } from "@/generated/prisma";
import type { TrashItemInput } from "./trash.repo";
import type { TrashKind } from "./trash.schema";

export type TrashItemFilter = {
  kinds: TrashKind[];
  ids?: string[];
  typeIds?: string[];
  surfaceKeys?: string[];
  batchId?: string;
};

export abstract class RecordTrashItemRepo {
  abstract findItemsCompanyWide(companyId: string, filter: TrashItemFilter): Promise<TrashItemRow[]>;
  abstract addItemsCompanyWide(companyId: string, items: TrashItemInput[]): Promise<void>;
  abstract removeItemsCompanyWide(companyId: string, ids: string[]): Promise<void>;
  abstract publishStagedRecordItemsCompanyWide(companyId: string, operationId: string): Promise<void>;
}
