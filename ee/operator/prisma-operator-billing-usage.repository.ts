import type { BillingUsageLedger, GetOperatorBillingUsageRepo } from "./get/get-operator-billing-usage.repo";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { ConnectedAccountStatus, Status } from "@/generated/prisma";

import { OPERATOR_AUDIT_ACTION } from "./operator.schema";
import { workspaceLabelFor } from "./workspace-label";

function deletedWorkspaceLabel(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const label = (metadata as Record<string, unknown>).workspaceLabel;

  return typeof label === "string" && label.length > 0 ? label : null;
}

const INTERVAL_SELECT = {
  companyId: true,
  kind: true,
  subjectId: true,
  startedAt: true,
  endedAt: true,
  startExact: true,
  endExact: true,
  firstName: true,
  lastName: true,
  email: true,
  roleName: true,
  provider: true,
  identifier: true,
} as const;

export class PrismaOperatorBillingUsageRepo extends TenantRepository implements GetOperatorBillingUsageRepo {
  @BypassTenantGuard
  async readBillingUsageLedgerUnscoped(args: {
    companyId?: string;
    from: Date;
    before: Date;
  }): Promise<BillingUsageLedger> {
    const scope = args.companyId ? { companyId: args.companyId } : {};
    const [recorded, companies, intervals] = await Promise.all([
      this.prisma.billingUsageWorkspace.findMany({
        where: args.companyId ? { companyId: args.companyId } : { createdAt: { lt: args.before } },
      }),
      this.prisma.company.findMany({
        where: args.companyId ? { id: args.companyId } : { createdAt: { lt: args.before } },
        select: { id: true, createdAt: true },
      }),
      this.prisma.billingUsageInterval.findMany({
        where: { ...scope, startedAt: { lt: args.before }, OR: [{ endedAt: null }, { endedAt: { gt: args.from } }] },
        select: INTERVAL_SELECT,
      }),
    ]);

    const seatIds = [...new Set(intervals.filter((row) => row.kind === "seat").map((row) => row.subjectId))];
    const firstSeats =
      seatIds.length === 0
        ? []
        : await this.prisma.billingUsageInterval.findMany({
            where: { ...scope, kind: "seat", subjectId: { in: seatIds }, startedAt: { lt: args.from } },
            orderBy: { startedAt: "asc" },
            distinct: ["subjectId"],
            select: INTERVAL_SELECT,
          });

    const recordedIds = new Set(recorded.map((workspace) => workspace.companyId));
    const observedAt = new Date();
    const workspaces = [
      ...recorded,
      ...companies
        .filter((company) => !recordedIds.has(company.id))
        .map((company) => ({
          companyId: company.id,
          createdAt: company.createdAt,
          deletedAt: null,
          seatsRecordedFrom: observedAt,
          channelsRecordedFrom: observedAt,
        })),
    ];

    const liveIds = workspaces.filter((workspace) => workspace.deletedAt === null).map((w) => w.companyId);
    const deletedIds = workspaces.filter((workspace) => workspace.deletedAt !== null).map((w) => w.companyId);

    const [members, activeSeats, connectedChannels, deletions] = await Promise.all([
      this.prisma.user.findMany({ where: { companyId: { in: liveIds } }, select: { companyId: true, email: true } }),
      this.prisma.user.groupBy({
        by: ["companyId"],
        where: { companyId: { in: liveIds }, status: Status.active },
        _count: { _all: true },
      }),
      this.prisma.connectedAccount.groupBy({
        by: ["companyId"],
        where: { companyId: { in: liveIds }, status: { not: ConnectedAccountStatus.deleted } },
        _count: { _all: true },
      }),
      deletedIds.length === 0
        ? Promise.resolve([])
        : this.prisma.operatorAuditEvent.findMany({
            where: { action: OPERATOR_AUDIT_ACTION.workspaceDelete, targetCompanyId: { in: deletedIds } },
            select: { targetCompanyId: true, metadata: true },
            orderBy: { createdAt: "desc" },
          }),
    ]);

    const membersByCompany = new Map<string, { email: string }[]>();
    for (const member of members) {
      const list = membersByCompany.get(member.companyId) ?? [];
      list.push(member);
      membersByCompany.set(member.companyId, list);
    }
    const seatCounts = new Map(activeSeats.map((row) => [row.companyId, row._count._all]));
    const channelCounts = new Map(connectedChannels.map((row) => [row.companyId, row._count._all]));
    const deletedLabels = new Map<string, string>();
    for (const deletion of deletions) {
      const label = deletedWorkspaceLabel(deletion.metadata);
      if (deletion.targetCompanyId && label && !deletedLabels.has(deletion.targetCompanyId))
        deletedLabels.set(deletion.targetCompanyId, label);
    }

    return {
      workspaces: workspaces.map((workspace) => ({
        companyId: workspace.companyId,
        workspaceLabel:
          workspace.deletedAt === null
            ? workspaceLabelFor(workspace.companyId, membersByCompany.get(workspace.companyId) ?? [])
            : (deletedLabels.get(workspace.companyId) ?? workspace.companyId.slice(0, 8)),
        createdAt: workspace.createdAt,
        deletedAt: workspace.deletedAt,
        seatsRecordedFrom: workspace.seatsRecordedFrom,
        channelsRecordedFrom: workspace.channelsRecordedFrom,
        activeSeats: seatCounts.get(workspace.companyId) ?? 0,
        connectedChannels: channelCounts.get(workspace.companyId) ?? 0,
      })),
      intervals: [...intervals, ...firstSeats],
    };
  }
}
