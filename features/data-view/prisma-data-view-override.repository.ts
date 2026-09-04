import type { DataViewState } from "@/core/data-view/data-view-state.schema";

import { BaseRepository } from "@/core/base/base-repository";
import { runAsViewOwner } from "@/core/data-view/view-owner-context";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { writeStoredState } from "./data-view-row-mapping";

export type UpsertDataViewOverrideArgs = {
  surfaceKey: string;
  viewKey: string;
  delta: DataViewState;
};

export type DeleteDataViewOverrideArgs = {
  surfaceKey: string;
  viewKey: string;
};

function viewIdFor(viewKey: string): string | null {
  return viewKey === ALL_VIEW_KEY ? null : viewKey;
}

export class PrismaDataViewOverrideRepo extends BaseRepository {
  async upsertOverride({ surfaceKey, viewKey, delta }: UpsertDataViewOverrideArgs): Promise<void> {
    await runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;
      const viewId = viewIdFor(viewKey);
      const columns = writeStoredState(delta);

      await this.prisma.dataViewOverride.upsert({
        where: {
          companyId_userId_surfaceKey_viewKey: { companyId, userId, surfaceKey, viewKey },
          companyId,
        },
        create: { companyId, userId, surfaceKey, viewKey, viewId, ...columns },
        update: { companyId, userId, surfaceKey, viewKey, viewId, ...columns },
      });
    });
  }

  async deleteOverride({ surfaceKey, viewKey }: DeleteDataViewOverrideArgs): Promise<boolean> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      const affected = await this.prisma.dataViewOverride.deleteMany({
        where: { companyId, userId, surfaceKey, viewKey },
      });

      return affected.count > 0;
    });
  }

  async pruneOrphanOverrides(surfaceKey: string, readableViewIds: string[]): Promise<void> {
    await runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      await this.prisma.dataViewOverride.deleteMany({
        where: {
          companyId,
          userId,
          surfaceKey,
          viewKey: { notIn: [ALL_VIEW_KEY, ...readableViewIds] },
        },
      });
    });
  }
}
