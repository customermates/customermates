import type { TrashRepo } from "./trash.repo";
import type { TrashKindHandler } from "./trash-kind-handler";
import type { PurgeCompanyTrash } from "./purge-expired-trash.interactor";

import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { purgeTrashItems } from "./delete-trash-permanently.interactor";

export function purgeCompanyTrash(
  trash: (companyId: string) => TrashRepo,
  handlers: (companyId: string) => TrashKindHandler[],
): PurgeCompanyTrash {
  return (companyId, administratorId, now, take) =>
    runAsBackgroundTenant(administratorId, () =>
      runInTransaction(
        async () => {
          const items = await trash(companyId).findExpired(now, take);
          await purgeTrashItems(handlers(companyId), items, null);
          return items.length;
        },
        { timeout: 60000 },
      ),
    );
}
