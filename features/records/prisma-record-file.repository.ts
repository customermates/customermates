import type { RecordFileRepo, StoredRecordFile } from "./record-file.repo";
import type { RecordRef } from "./record-model.schema";

import { TenantRepository } from "@/core/base/tenant-repository";

export class PrismaRecordFileRepo extends TenantRepository implements RecordFileRepo {
  async getFilesCompanyWide(fileIds: string[]): Promise<StoredRecordFile[]> {
    if (!fileIds.length) return [];
    const rows = await this.prisma.recordFile.findMany({
      where: { companyId: this.companyId, id: { in: [...new Set(fileIds)] } },
      select: {
        id: true,
        typeId: true,
        fieldId: true,
        recordId: true,
        storageDriver: true,
        storageKey: true,
        name: true,
        mimeType: true,
        size: true,
        sha256: true,
        status: true,
        uploadedById: true,
        createdAt: true,
        attachedAt: true,
        detachedAt: true,
      },
    });
    return rows.map((row) => ({ ...row, size: Number(row.size) }));
  }

  async attachFiles(ref: RecordRef, fieldId: string, fileIds: string[]): Promise<number> {
    if (!fileIds.length) return 0;
    const result = await this.prisma.recordFile.updateMany({
      where: {
        companyId: this.companyId,
        typeId: ref.typeId,
        fieldId,
        id: { in: [...new Set(fileIds)] },
        OR: [{ recordId: null, status: { in: ["pending", "ready"] } }, { recordId: ref.recordId }],
      },
      data: {
        recordId: ref.recordId,
        status: "ready",
        attachedAt: new Date(),
        detachedAt: null,
      },
    });
    return result.count;
  }

  async detachFiles(ref: RecordRef, fieldId: string, fileIds: string[]): Promise<number> {
    if (!fileIds.length) return 0;
    const result = await this.prisma.recordFile.updateMany({
      where: {
        companyId: this.companyId,
        typeId: ref.typeId,
        fieldId,
        recordId: ref.recordId,
        id: { in: [...new Set(fileIds)] },
        status: { not: "detached" },
      },
      data: { status: "detached", detachedAt: new Date() },
    });
    return result.count;
  }
}
