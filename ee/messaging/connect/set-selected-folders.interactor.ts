import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ConnectedAccountDto } from "../messaging.schema";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { z } from "zod";

import { Resource } from "@/generated/prisma";

import { ConnectedAccountAppDtoSchema } from "../messaging.schema";
import { toConnectedAccountDto } from "./connected-account-dto";
import { isSkippedEmailFolder } from "../email-folders";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import type { SetSelectedFoldersRepo } from "./set-selected-folders.repo";

export const SetSelectedFoldersSchema = z
  .object({
    id: z.uuid(),
    selectedFolderIds: z.array(z.string()),
  })
  .strict();
type SetSelectedFoldersData = Data<typeof SetSelectedFoldersSchema>;

@TenantInteractor({ resource: Resource.inboxMessages, manage: "update" })
export class SetSelectedFoldersInteractor extends AuthenticatedInteractor<SetSelectedFoldersData, ConnectedAccountDto> {
  constructor(
    private repo: SetSelectedFoldersRepo,
    private backgroundTaskService: BackgroundTaskService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(SetSelectedFoldersSchema)
  @ValidateOutput(ConnectedAccountAppDtoSchema)
  async invoke(data: SetSelectedFoldersData): Validated<ConnectedAccountDto> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const { updated, connectedAccountId, newlyEnabled } = await runInTransaction(async () => {
      const ctx = await this.repo.getAccountFolderContextOrThrow(data.id);
      const byId = new Map(ctx.folders.map((folder) => [folder.id, folder]));
      const selectedFolderIds = [...new Set(data.selectedFolderIds)].filter((id) => byId.has(id)).sort();
      const enabled = selectedFolderIds.filter(
        (id) => !ctx.selectedFolderIds.includes(id) && isSkippedEmailFolder(byId.get(id) ?? {}),
      );
      const saved = await this.repo.setSelectedFoldersOrThrow({ id: data.id, selectedFolderIds });
      return { updated: saved, connectedAccountId: ctx.id, newlyEnabled: enabled };
    });

    if (newlyEnabled.length > 0) {
      await this.backgroundTaskService.dispatch("backfill-connected-account", {
        connectedAccountId,
        sourceFilter: newlyEnabled,
      });
    }

    return { ok: true as const, data: toConnectedAccountDto(updated) };
  }
}
