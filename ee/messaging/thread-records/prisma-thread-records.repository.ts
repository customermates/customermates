import { BaseRepository } from "@/core/base/base-repository";
import type { RecordRef } from "@/features/records/record-model.schema";
import { threadAccessWhere } from "../messaging-access";
import type { ThreadRecordsRepo } from "./thread-records.repo";

export class PrismaThreadRecordsRepo extends BaseRepository implements ThreadRecordsRepo {
  async canAccessThread(threadId: string) {
    return Boolean(
      await this.prisma.messagingThread.findFirst({
        where: { AND: [{ companyId: this.companyId, id: threadId }, threadAccessWhere(this.companyId, this.userId)] },
        select: { id: true },
      }),
    );
  }

  async listLinks(threadId: string, take: number) {
    const rows = await this.prisma.messagingThreadRecordLink.findMany({
      where: { companyId: this.companyId, threadId },
      orderBy: [{ typeId: "asc" }, { recordId: "asc" }],
      take,
      select: { typeId: true, recordId: true, record: { select: { protectedKind: true } } },
    });
    return rows.map((row) => ({
      typeId: row.typeId,
      recordId: row.recordId,
      protected: row.record.protectedKind !== null,
    }));
  }

  async has(threadId: string, ref: RecordRef) {
    return Boolean(
      await this.prisma.messagingThreadRecordLink.findFirst({
        where: { companyId: this.companyId, threadId, typeId: ref.typeId, recordId: ref.recordId },
        select: { recordId: true },
      }),
    );
  }

  async link(threadId: string, ref: RecordRef) {
    await this.prisma.messagingThreadRecordLink.createMany({
      data: { companyId: this.companyId, threadId, typeId: ref.typeId, recordId: ref.recordId },
      skipDuplicates: true,
    });
  }

  async unlink(threadId: string, ref: RecordRef) {
    await this.prisma.messagingThreadRecordLink.deleteMany({
      where: { companyId: this.companyId, threadId, typeId: ref.typeId, recordId: ref.recordId },
    });
  }

  async audit(threadId: string, ref: RecordRef, action: "link" | "unlink") {
    await this.prisma.auditLog.create({
      data: {
        companyId: this.companyId,
        userId: this.userId,
        entityId: threadId,
        event: `messaging.thread.record.${action === "link" ? "linked" : "unlinked"}`,
        eventData: { version: 2, threadId, ref },
      },
    });
  }
}
