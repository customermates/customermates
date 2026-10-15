import type { FileContentRepo, FileContentSize } from "./file-content.repo";

import { Prisma } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";

export class PrismaFileContentRepo extends TenantRepository implements FileContentRepo {
  async writePart(fileKey: string, part: number, data: Uint8Array): Promise<void> {
    const companyId = this.companyId;
    await this.prisma.recordFileContent.upsert({
      where: { fileKey_part: { fileKey, part }, companyId },
      create: { fileKey, part, companyId, data: new Uint8Array(data) },
      update: { companyId, data: new Uint8Array(data) },
    });
  }

  async readPart(fileKey: string, part: number): Promise<Uint8Array | null> {
    const row = await this.prisma.recordFileContent.findFirst({
      where: { companyId: this.companyId, fileKey, part },
      select: { data: true },
    });
    return row ? new Uint8Array(row.data) : null;
  }

  async size(fileKey: string): Promise<FileContentSize | null> {
    const [row] = await this.prisma.$queryRaw<Array<{ size: bigint | null; parts: bigint }>>(Prisma.sql`
      SELECT SUM(octet_length(data)) AS size, COUNT(*) AS parts FROM "RecordFileContent"
      WHERE "companyId" = ${this.companyId} AND "fileKey" = ${fileKey}`);
    return row && row.parts > 0n ? { size: Number(row.size ?? 0n), parts: Number(row.parts) } : null;
  }

  async deleteParts(fileKeys: string[]): Promise<void> {
    if (!fileKeys.length) return;
    await this.prisma.recordFileContent.deleteMany({
      where: { companyId: this.companyId, fileKey: { in: [...new Set(fileKeys)] } },
    });
  }
}
