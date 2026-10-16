import { TenantRepository } from "@/core/base/tenant-repository";
import { BillingUsageKind, ConnectedAccountStatus, Status } from "@/generated/prisma";

export type BillingUsageChanges = readonly string[] | "sweep";

export function seatChange(subjectId: string, before: Status | null | undefined, after: Status | null): string[] {
  return (before === Status.active) !== (after === Status.active) ? [subjectId] : [];
}

export function channelChange(
  subjectId: string,
  before: ConnectedAccountStatus | null | undefined,
  after: ConnectedAccountStatus | null,
): string[] {
  const counted = (status: ConnectedAccountStatus | null | undefined) =>
    status !== null && status !== undefined && status !== ConnectedAccountStatus.deleted;

  return counted(before) !== counted(after) ? [subjectId] : [];
}

type Snapshot = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  roleName: string | null;
  provider: string | null;
  identifier: string | null;
};

type Subject = Snapshot & { subjectId: string };

function sameIdentity(a: Snapshot, b: Snapshot): boolean {
  return (
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.email === b.email &&
    a.provider === b.provider &&
    a.identifier === b.identifier
  );
}

export class BillingUsageLedger extends TenantRepository {
  async recordSeats(companyId: string, changed: BillingUsageChanges): Promise<void> {
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
      changed,
    );
  }

  async recordChannels(companyId: string, changed: BillingUsageChanges): Promise<void> {
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
      changed,
    );
  }

  async recordWorkspaceCreated(companyId: string): Promise<void> {
    const company = await this.prisma.company.findFirst({ where: { id: companyId }, select: { createdAt: true } });

    await this.prisma.billingUsageWorkspace.createMany({
      data: [{ companyId, createdAt: company?.createdAt ?? new Date() }],
      skipDuplicates: true,
    });
  }

  async recordWorkspaceDeleted(companyId: string, changed: "deleted" | "sweep"): Promise<void> {
    if (changed === "deleted") {
      await this.recordSeats(companyId, []);
      await this.recordChannels(companyId, []);
    }
    const now = new Date();
    await this.ensureWorkspace(companyId, now);

    await this.prisma.billingUsageInterval.updateMany({
      where: { companyId, endedAt: null },
      data: { endedAt: now, endExact: changed === "deleted" },
    });
    await this.prisma.billingUsageInterval.updateMany({
      where: { companyId },
      data: { firstName: null, lastName: null, email: null, identifier: null },
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
    changed: BillingUsageChanges,
  ): Promise<void> {
    const now = new Date();
    const exact = (subjectId: string) => changed !== "sweep" && changed.includes(subjectId);
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

    const ended = open.filter((interval) => !currentById.has(interval.subjectId));
    for (const endExact of [true, false]) {
      const ids = ended.filter((interval) => exact(interval.subjectId) === endExact).map((interval) => interval.id);
      if (ids.length > 0) {
        await this.prisma.billingUsageInterval.updateMany({
          where: { companyId, id: { in: ids }, endedAt: null },
          data: { endedAt: now, endExact },
        });
      }
    }

    const started = current.filter((subject) => !openById.has(subject.subjectId));
    if (started.length > 0) {
      await this.prisma.billingUsageInterval.createMany({
        data: started.map((subject) => ({
          companyId,
          kind,
          startedAt: now,
          startExact: exact(subject.subjectId),
          ...subject,
        })),
        skipDuplicates: true,
      });
    }

    const renamed = new Map<string | null, string[]>();
    for (const subject of current) {
      const interval = openById.get(subject.subjectId);
      if (!interval) continue;
      if (!sameIdentity(interval, subject)) {
        await this.prisma.billingUsageInterval.updateMany({
          where: { companyId, id: interval.id },
          data: {
            firstName: subject.firstName,
            lastName: subject.lastName,
            email: subject.email,
            provider: subject.provider,
            identifier: subject.identifier,
          },
        });
      }
      if (interval.roleName !== subject.roleName)
        renamed.set(subject.roleName, [...(renamed.get(subject.roleName) ?? []), interval.id]);
    }
    for (const [roleName, ids] of renamed)
      await this.prisma.billingUsageInterval.updateMany({ where: { companyId, id: { in: ids } }, data: { roleName } });
  }

  private async ensureWorkspace(companyId: string, now: Date): Promise<void> {
    const existing = await this.prisma.billingUsageWorkspace.findFirst({
      where: { companyId },
      select: { companyId: true },
    });
    if (existing) return;

    const company = await this.prisma.company.findFirst({ where: { id: companyId }, select: { createdAt: true } });

    await this.prisma.billingUsageWorkspace.createMany({
      data: [
        {
          companyId,
          createdAt: company?.createdAt ?? now,
          seatsRecordedFrom: now,
          channelsRecordedFrom: now,
        },
      ],
      skipDuplicates: true,
    });
  }
}
