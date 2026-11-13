import type { BillingUsageLedger, GetOperatorBillingUsageRepo } from "./get/get-operator-billing-usage.repo";
import type { WorkspaceSubscriptionDto } from "./billing-usage.schema";
import type { WorkspaceMeasurementRow } from "./workspace-measurement";
import type { SubscriptionPlan } from "@/generated/prisma";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { ConnectedAccountStatus, Status, SubscriptionStatus } from "@/generated/prisma";
import { effectivePlanId } from "@/ee/subscription/entitlements";

import { OBSERVATION_LAG_MS } from "./billing-usage";
import { OPERATOR_AUDIT_ACTION } from "./operator.schema";
import { resolveWorkspaceOwners } from "./operator-list-filters";
import { earliestOf, secondWeekWindow } from "./workspace-activation";
import { workspaceLabelFor } from "./workspace-label";

const SECOND_WEEK_QUERY_CHUNK = 10;
const RECORD_CHANGE_EVENT_KINDS = ["record.created", "record.updated", "record.deleted", "record.restored"] as const;

function deletedWorkspaceLabel(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const label = (metadata as Record<string, unknown>).workspaceLabel;

  return typeof label === "string" && label.length > 0 ? label : null;
}

function workspaceSubscription(subscription: {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  lemonSqueezyId: string | null;
  quantity: number | null;
  trialEndDate: Date | null;
  currentPeriodEnd: Date | null;
  enterpriseAgentCreditsPerUser: number | null;
}): WorkspaceSubscriptionDto {
  const { lemonSqueezyId, ...terms } = subscription;
  const now = new Date();

  return {
    ...terms,
    billing: lemonSqueezyId ? "lemonSqueezy" : "manual",
    trialEnded:
      subscription.status === SubscriptionStatus.trial &&
      subscription.trialEndDate !== null &&
      subscription.trialEndDate < now,
    effectivePlan: effectivePlanId(subscription, now),
  };
}

const INTERVAL_SELECT = {
  id: true,
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
    const [recorded, companies, intervals, recording] = await Promise.all([
      this.prisma.billingUsageWorkspace.findMany({
        where: args.companyId
          ? { companyId: args.companyId }
          : { workspaceCreatedAt: { lt: args.before }, OR: [{ deletedAt: null }, { deletedAt: { gt: args.from } }] },
        select: {
          companyId: true,
          workspaceCreatedAt: true,
          deletedAt: true,
          seatsRecordedFrom: true,
          channelsRecordedFrom: true,
          workspaceLabel: true,
        },
      }),
      this.prisma.company.findMany({
        where: args.companyId ? { id: args.companyId } : { createdAt: { lt: args.before } },
        select: {
          id: true,
          name: true,
          createdAt: true,
          subscription: {
            select: {
              plan: true,
              status: true,
              lemonSqueezyId: true,
              quantity: true,
              trialEndDate: true,
              currentPeriodEnd: true,
              enterpriseAgentCreditsPerUser: true,
            },
          },
        },
      }),
      this.prisma.billingUsageInterval.findMany({
        where: {
          ...scope,
          startedAt: {
            lt: new Date(args.before.getTime() + OBSERVATION_LAG_MS),
          },
          OR: [{ endedAt: null }, { endedAt: { gt: args.from } }],
        },
        select: INTERVAL_SELECT,
      }),
      this.prisma.billingUsageWorkspace.aggregate({
        _min: { seatsRecordedFrom: true },
      }),
    ]);

    const seatIds = [...new Set(intervals.filter((row) => row.kind === "seat").map((row) => row.subjectId))];
    const firstSeats =
      seatIds.length === 0
        ? []
        : await this.prisma.billingUsageInterval.findMany({
            where: {
              ...scope,
              kind: "seat",
              subjectId: { in: seatIds },
              startedAt: { lt: args.from },
            },
            orderBy: { startedAt: "asc" },
            distinct: ["subjectId"],
            select: INTERVAL_SELECT,
          });

    const intervalIds = new Set(intervals.map((row) => row.id));
    const recordedIds = new Set(recorded.map((workspace) => workspace.companyId));
    const observedAt = new Date();
    const workspaces = [
      ...recorded.map(({ workspaceCreatedAt, workspaceLabel: _label, ...workspace }) => ({
        ...workspace,
        createdAt: workspaceCreatedAt,
      })),
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

    const liveIds = workspaces
      .filter((workspace) => workspace.deletedAt === null)
      .map((workspace) => workspace.companyId);
    const deletedIds = workspaces
      .filter((workspace) => workspace.deletedAt !== null)
      .map((workspace) => workspace.companyId);

    const companyNames = new Map(companies.map((company) => [company.id, company.name]));
    const recordedLabels = new Map(
      recorded.flatMap((workspace) =>
        workspace.workspaceLabel ? [[workspace.companyId, workspace.workspaceLabel]] : [],
      ),
    );
    const unlabeledDeletedIds = deletedIds.filter((companyId) => !recordedLabels.has(companyId));
    const [owners, activeSeats, connectedChannels, deletions] = await Promise.all([
      resolveWorkspaceOwners(this.prisma, liveIds),
      this.prisma.user.groupBy({
        by: ["companyId"],
        where: {
          companyId: { in: liveIds },
          status: Status.active,
          leftAt: null,
        },
        _count: { _all: true },
      }),
      this.prisma.connectedAccount.groupBy({
        by: ["companyId"],
        where: {
          companyId: { in: liveIds },
          status: { not: ConnectedAccountStatus.deleted },
        },
        _count: { _all: true },
      }),
      unlabeledDeletedIds.length === 0
        ? Promise.resolve([])
        : this.prisma.operatorAuditEvent.findMany({
            where: {
              action: OPERATOR_AUDIT_ACTION.workspaceDelete,
              targetCompanyId: { in: unlabeledDeletedIds },
            },
            select: { targetCompanyId: true, metadata: true },
            orderBy: { createdAt: "desc" },
          }),
    ]);

    const subscriptions = new Map(
      companies.map((company) => [
        company.id,
        company.subscription ? workspaceSubscription(company.subscription) : null,
      ]),
    );
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
            ? workspaceLabelFor(
                {
                  id: workspace.companyId,
                  name: companyNames.get(workspace.companyId) ?? null,
                },
                owners.get(workspace.companyId)?.email ?? null,
              )
            : (recordedLabels.get(workspace.companyId) ??
              deletedLabels.get(workspace.companyId) ??
              workspace.companyId.slice(0, 8)),
        ownerEmail: workspace.deletedAt === null ? (owners.get(workspace.companyId)?.email ?? null) : null,
        createdAt: workspace.createdAt,
        deletedAt: workspace.deletedAt,
        seatsRecordedFrom: workspace.seatsRecordedFrom,
        channelsRecordedFrom: workspace.channelsRecordedFrom,
        activeSeats: seatCounts.get(workspace.companyId) ?? 0,
        connectedChannels: channelCounts.get(workspace.companyId) ?? 0,
        subscription: workspace.deletedAt === null ? (subscriptions.get(workspace.companyId) ?? null) : null,
      })),
      intervals: [...intervals, ...firstSeats.filter((row) => !intervalIds.has(row.id))],
      recordingStartedAt: recording._min.seatsRecordedFrom,
    };
  }

  @BypassTenantGuard
  async readWorkspaceMeasurementsUnscoped(
    workspaces: ReadonlyArray<{ companyId: string; createdAt: Date }>,
  ): Promise<Map<string, WorkspaceMeasurementRow>> {
    if (workspaces.length === 0) return new Map();
    const companyIds = workspaces.map((workspace) => workspace.companyId);
    const now = new Date();
    const [companies, accounts, owners, revisions, records, secondWeek, members] = await Promise.all([
      this.prisma.company.findMany({
        where: { id: { in: companyIds } },
        select: {
          id: true,
          signupTemplate: true,
          signupLastPage: true,
          signupCampaign: true,
          teamSize: true,
          agentLastCallAt: true,
          discoveryChoice: true,
          discoveryDetail: true,
          discoveryAnsweredAt: true,
          agentFirstCallAt: true,
          signupSource: {
            select: {
              job: true,
              landingPath: true,
              referrerHost: true,
              utmSource: true,
              utmMedium: true,
              utmCampaign: true,
              marketingConsentedAt: true,
              capturedAt: true,
            },
          },
          funnelEvents: { select: { type: true, occurredAt: true } },
        },
      }),
      this.prisma.connectedAccount.groupBy({
        by: ["companyId"],
        where: { companyId: { in: companyIds } },
        _min: { createdAt: true },
      }),
      this.prisma.user.groupBy({
        by: ["companyId"],
        where: {
          companyId: { in: companyIds },
          onboardingWizardCompletedAt: { not: null },
          role: { isSystemRole: true },
        },
        _min: { onboardingWizardCompletedAt: true },
      }),
      this.prisma.recordSchemaRevision.groupBy({
        by: ["companyId"],
        where: { companyId: { in: companyIds } },
        _min: { createdAt: true },
      }),
      this.prisma.eventLog.groupBy({
        by: ["companyId"],
        where: { companyId: { in: companyIds }, subjectKind: "record", kind: "record.created", actorId: { not: null } },
        _min: { createdAt: true },
      }),
      this.firstChangesInSecondWeek(workspaces, now),
      this.prisma.user.findMany({
        where: { companyId: { in: companyIds } },
        select: { companyId: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const seatsSeen = new Map<string, number>();
    const secondSeat = new Map<string, Date>();
    for (const member of members) {
      const seen = (seatsSeen.get(member.companyId) ?? 0) + 1;
      seatsSeen.set(member.companyId, seen);
      if (seen === 2) secondSeat.set(member.companyId, member.createdAt);
    }

    const firstAccount = new Map(accounts.map((row) => [row.companyId, row._min.createdAt]));
    const firstOwnerWizard = new Map(owners.map((row) => [row.companyId, row._min.onboardingWizardCompletedAt]));
    const firstRevision = new Map(revisions.map((row) => [row.companyId, row._min.createdAt]));
    const firstRecord = new Map(records.map((row) => [row.companyId, row._min.createdAt]));

    return new Map(
      companies.map((company) => {
        const funnel = new Map(company.funnelEvents.map((event) => [event.type, event.occurredAt]));
        const row: WorkspaceMeasurementRow = {
          signupTemplate: company.signupTemplate,
          signupLastPage: company.signupLastPage,
          signupCampaign: company.signupCampaign,
          teamSize: company.teamSize,
          agentLastCallAt: company.agentLastCallAt,
          funnelChannelSkippedAt: funnel.get("channelSkipped") ?? null,
          funnelInviteSentAt: funnel.get("inviteSent") ?? null,
          funnelInviteAcceptedAt: funnel.get("inviteAccepted") ?? null,
          funnelPaidAt: funnel.get("paid") ?? null,
          secondSeatAt: secondSeat.get(company.id) ?? null,
          discoveryChoice: company.discoveryChoice,
          discoveryDetail: company.discoveryDetail,
          discoveryAnsweredAt: company.discoveryAnsweredAt,
          signupSource: company.signupSource,
          agentFirstCallAt: company.agentFirstCallAt,
          funnelSetupCompletedAt: funnel.get("setupCompleted") ?? null,
          funnelAgentConnectedAt: funnel.get("agentConnected") ?? null,
          funnelChannelConnectedAt: funnel.get("channelConnected") ?? null,
          wizardCompletedAt: firstOwnerWizard.get(company.id) ?? null,
          firstConnectedAccountAt: firstAccount.get(company.id) ?? null,
          firstModelChangeAt: firstRevision.get(company.id) ?? null,
          firstRecordCreatedAt: firstRecord.get(company.id) ?? null,
          changeInSecondWeekAt: secondWeek.get(company.id) ?? null,
        };
        return [company.id, row];
      }),
    );
  }

  private async firstChangesInSecondWeek(
    workspaces: ReadonlyArray<{ companyId: string; createdAt: Date }>,
    now: Date,
  ): Promise<Map<string, Date>> {
    const reached = workspaces.filter((workspace) => secondWeekWindow(workspace.createdAt).from <= now);
    const found = new Map<string, Date>();
    for (let start = 0; start < reached.length; start += SECOND_WEEK_QUERY_CHUNK) {
      const chunk = reached.slice(start, start + SECOND_WEEK_QUERY_CHUNK);
      const changes = await Promise.all(chunk.map((workspace) => this.firstChangeInSecondWeek(workspace)));
      chunk.forEach((workspace, index) => {
        const change = changes[index];
        if (change) found.set(workspace.companyId, change);
      });
    }
    return found;
  }

  private async firstChangeInSecondWeek(workspace: { companyId: string; createdAt: Date }): Promise<Date | null> {
    const { from, to } = secondWeekWindow(workspace.createdAt);
    const createdAt = { gte: from, lt: to };
    const [record, model] = await Promise.all([
      this.prisma.eventLog.findFirst({
        where: {
          companyId: workspace.companyId,
          subjectKind: "record",
          kind: { in: [...RECORD_CHANGE_EVENT_KINDS] },
          actorId: { not: null },
          createdAt,
        },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      this.prisma.recordSchemaRevision.findFirst({
        where: { companyId: workspace.companyId, createdAt },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
    ]);
    return earliestOf(record?.createdAt ?? null, model?.createdAt ?? null);
  }
}
