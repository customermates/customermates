import type { FileStorageDriver } from "@/core/storage/file-storage-driver";

import { z } from "zod";

import { Enforce } from "@/core/decorators/enforce.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const PurgeCompanyFileObjectsSchema = z.object({ companyId: z.uuid() }).strict();
type PurgeCompanyFileObjectsData = z.infer<typeof PurgeCompanyFileObjectsSchema>;

@SystemInteractor
export class PurgeCompanyFileObjectsInteractor {
  constructor(private drivers: () => FileStorageDriver[]) {}

  @Enforce(PurgeCompanyFileObjectsSchema)
  async invoke({ companyId }: PurgeCompanyFileObjectsData): Promise<{ deleted: number }> {
    let deleted = 0;
    for (const driver of this.drivers()) deleted += (await driver.deletePrefix?.(`${companyId}/`)) ?? 0;
    return { deleted };
  }
}
