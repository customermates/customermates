import { TenantRepository } from "@/core/base/tenant-repository";
import { BillingUsageKind, ConnectedAccountStatus, Status } from "@/generated/prisma";

export type BillingUsageObservation = "change" | "sweep";

type Subject = {
  subjectId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  roleName: string | null;
  provider: string | null;
  identifier: string | null;
};

const SNAPSHOT_FIELDS = ["firstName", "lastName", "email", "roleName", "provider", "identifier"] as const;

const NEW_WORKSPACE_WINDOW_MS = 10 * 60 * 1000;

export class BillingUsageLedger extends TenantRepository {
  async recordSeats(companyId: string, observation: BillingUsageObservation = "change"): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { companyId, status: Status.active },
      select: { id: true, firstName: true, lastName: true, email: true, role: { select: { name: true } } },
    });

    await this.reconcile(
      companyId,
      BillingUsageKind.seat,
      users.map((user) => ({
        subjectId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        roleName: user.role?.name ?? null,
        provider: null,
        identifier: null,
      })),
      observation,
    );
  }

  async recordChannels(companyId: string, observation: BillingUsageObservation = "change"): Promise<void> {
    const accounts = await this.prisma.connectedAccount.findMany({
      where: { companyId, status: { not: ConnectedAccountStatus.deleted } },
      select: { id: true, provider: true, emailAddress: true, displayName: true, unipileAccountId: true },
    });

    await this.reconcile(
      companyId,
      BillingUsageKind.channel,
      accounts.map((account) => ({
        subjectId: account.id,
        firstName: null,
        lastName: null,
        email: null,
        roleName: null,
        provider: account.provider,
        identifier: account.emailAddress || account.displayName || account.unipileAccountId,
      })),
      observation,
    );
  }

  async recordWorkspace(companyId: string): Promise<void> {
    await this.ensureWorkspace(companyId, new Date());
  }

  async recordWorkspaceDeleted(companyId: string, observation: BillingUsageObservation = "change"): Promise<void> {
    const now = new Date();
    const exact = observation === "change";

    await this.ensureWorkspace(companyId, now);
    await this.prisma.billingUsageInterval.updateMany({
      where: { companyId, endedAt: null },
      data: { endedAt: now, endExact: exact },
    });
    await this.prisma.billingUsageWorkspace.updateMany({
      where: { companyId, deletedAt: null },
      data: { deletedAt: now },
    });
  }

  private async reconcile(
    companyId: string,
    kind: BillingUsageKind,
    current: Subject[],
    observation: BillingUsageObservation,
  ): Promise<void> {
    const now = new Date();
    const exact = observation === "change";
    await this.ensureWorkspace(companyId, now);

    const open = await this.prisma.billingUsageInterval.findMany({
      where: { companyId, kind, endedAt: null },
      select: {
        id: true,
        subjectId: true,
        firstName: true,
        lastName: true,
        email: true,
        roleName: true,
        provider: true,
        identifier: true,
      },
    });
    const currentById = new Map(current.map((subject) => [subject.subjectId, subject]));
    const openById = new Map(open.map((interval) => [interval.subjectId, interval]));

    const ended = open.filter((interval) => !currentById.has(interval.subjectId)).map((interval) => interval.id);
    if (ended.length > 0) {
      await this.prisma.billingUsageInterval.updateMany({
        where: { companyId, id: { in: ended } },
        data: { endedAt: now, endExact: exact },
      });
    }

    const started = current.filter((subject) => !openById.has(subject.subjectId));
    if (started.length > 0) {
      await this.prisma.billingUsageInterval.createMany({
        data: started.map((subject) => ({ companyId, kind, startedAt: now, startExact: exact, ...subject })),
        skipDuplicates: true,
      });
    }

    for (const subject of current) {
      const interval = openById.get(subject.subjectId);
      if (!interval || SNAPSHOT_FIELDS.every((field) => interval[field] === subject[field])) continue;
      await this.prisma.billingUsageInterval.updateMany({
        where: { companyId, id: interval.id },
        data: {
          firstName: subject.firstName,
          lastName: subject.lastName,
          email: subject.email,
          roleName: subject.roleName,
          provider: subject.provider,
          identifier: subject.identifier,
        },
      });
    }
  }

  private async ensureWorkspace(companyId: string, now: Date): Promise<void> {
    const existing = await this.prisma.billingUsageWorkspace.findFirst({
      where: { companyId },
      select: { companyId: true },
    });
    if (existing) return;

    const company = await this.prisma.company.findFirst({ where: { id: companyId }, select: { createdAt: true } });
    const createdAt = company?.createdAt ?? now;
    const recordedSinceCreation = now.getTime() - createdAt.getTime() <= NEW_WORKSPACE_WINDOW_MS;
    const recordedFrom = recordedSinceCreation ? null : now;

    await this.prisma.billingUsageWorkspace.createMany({
      data: [{ companyId, createdAt, seatsRecordedFrom: recordedFrom, channelsRecordedFrom: recordedFrom }],
      skipDuplicates: true,
    });
  }
}
