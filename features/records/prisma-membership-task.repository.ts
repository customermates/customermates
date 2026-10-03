import type { MembershipTaskRepo } from "./membership-task.repo";
import type { RecordRef } from "./record-model.schema";
import type { RecordReadScope } from "./record-query.schema";
import { UserAccessor } from "@/core/base/user-accessor";
import { getTransactionClient } from "@/core/decorators/transaction-context";
import { prisma } from "@/prisma/db";

export class PrismaMembershipTaskRepo extends UserAccessor implements MembershipTaskRepo {
  private get prisma() {
    return getTransactionClient() ?? prisma;
  }

  getMemberCompanyWide(userId: string) {
    return this.prisma.user.findFirst({
      where: { companyId: this.companyId, id: userId },
      select: { id: true, email: true, status: true },
    });
  }

  async findCompanyWide(typeId: string, userId: string, take: number): Promise<RecordRef[]> {
    const rows = await this.prisma.crmRecord.findMany({
      where: {
        companyId: this.companyId,
        typeId,
        protectedKind: "membershipAuthorization",
        systemData: { path: ["relatedUserId"], equals: userId },
      },
      select: { id: true, typeId: true },
      orderBy: { id: "asc" },
      take,
    });
    return rows.map(({ typeId, id }) => ({ typeId, recordId: id }));
  }

  async protect(ref: RecordRef, userId: string): Promise<void> {
    if (!(await this.getMemberCompanyWide(userId))) throw new Error("The membership task user is unavailable.");
    await this.prisma.crmRecord.update({
      where: {
        companyId: this.companyId,
        companyId_typeId_id: { companyId: this.companyId, typeId: ref.typeId, id: ref.recordId },
      },
      data: { protectedKind: "membershipAuthorization", systemData: { relatedUserId: userId } },
    });
  }

  count(typeId: string, scope: RecordReadScope): Promise<number> {
    if (scope.access === "none") return Promise.resolve(0);
    return this.prisma.crmRecord.count({
      where: {
        companyId: this.companyId,
        typeId,
        protectedKind: "membershipAuthorization",
        ...(scope.access === "own" ? { assignments: { some: { userId: scope.userId } } } : {}),
      },
    });
  }
}
