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
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import type { SetSelectedFoldersRepo } from "./set-selected-folders.repo";

const Schema = z.object({
  id: z.uuid(),
  selectedFolderIds: z.array(z.string()),
});
type SetSelectedFoldersData = Data<typeof Schema>;

@TenantInteractor({ resource: Resource.inboxMessages, manage: "update" })
export class SetSelectedFoldersInteractor extends AuthenticatedInteractor<SetSelectedFoldersData, ConnectedAccountDto> {
  constructor(
    private repo: SetSelectedFoldersRepo,
    private backgroundTaskService: BackgroundTaskService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Enforce(Schema)
  @ValidateOutput(ConnectedAccountAppDtoSchema)
  async invoke(data: SetSelectedFoldersData): Validated<ConnectedAccountDto> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const ctx = await this.repo.getAccountFolderContextOrThrow(data.id);
    const byId = new Map(ctx.folders.map((folder) => [folder.id, folder]));

    const selectedFolderIds = [...new Set(data.selectedFolderIds)].filter((id) => byId.has(id)).sort();

    const newlyEnabled = selectedFolderIds.filter(
      (id) => !ctx.selectedFolderIds.includes(id) && isSkippedEmailFolder(byId.get(id) ?? {}),
    );
    if (newlyEnabled.length > 0) {
      await this.backgroundTaskService.dispatch("backfill-connected-account", {
        connectedAccountId: ctx.id,
        sourceFilter: newlyEnabled,
      });
    }

    const updated = await this.repo.setSelectedFoldersOrThrow({
      id: data.id,
      selectedFolderIds,
    });
    return { ok: true as const, data: toConnectedAccountDto(updated) };
  }
}
