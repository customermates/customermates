import type { MembershipTaskRepo } from "./membership-task.repo";
import type { RecordRef } from "./record-model.schema";
import type { RecordReadScope } from "./record-query.schema";
import type { PrismaUserRepo } from "@/features/user/prisma-user.repository";
import { TenantRepository } from "@/core/base/tenant-repository";

export class PrismaMembershipTaskRepo extends TenantRepository implements MembershipTaskRepo {
  constructor(private members: Pick<PrismaUserRepo, "getRecordMemberCompanyWide">) {
    super();
  }

  getMemberCompanyWide(userId: string) {
    return this.members.getRecordMemberCompanyWide(userId);
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
