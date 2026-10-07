import type { EventLog } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { EventAdmission } from "@/features/event/event-admission";
import { eventEnvelope } from "@/features/event/event-envelope";
import { RecordEventPayloadSchema } from "@/features/records/record-event.schema";
import type { RecordRecipientReader } from "@/features/records/record-recipient-reader";
import type { EventRoutineCandidate, TriggerRoutinesRepo } from "./trigger-routines.repo";

export class RoutineAdmission extends TenantRepository implements EventAdmission {
  constructor(
    private readonly routines: TriggerRoutinesRepo,
    private readonly background: BackgroundTaskService,
    private readonly reader: RecordRecipientReader,
  ) {
    super();
  }

  @BypassTenantGuard
  async admit(event: EventLog): Promise<void> {
    const subscribed = await this.routines.findEventRoutinesUnscoped(event.companyId, event.kind);
    if (!subscribed.length) return;
    if (event.subjectKind !== "record") {
      await this.start(event, eventEnvelope(event), subscribed);
      return;
    }
    const payload = RecordEventPayloadSchema.parse(event.payload);
    if (payload.cause.routineDepth !== undefined) return;
    const matches = await this.prisma.recordEventMatch.findMany({
      where: {
        companyId: event.companyId,
        eventId: event.id,
        subscription: { companyId: event.companyId, kind: "routine", enabled: true },
      },
      include: { subscription: true },
    });
    const byId = new Map(subscribed.map((routine) => [routine.id, routine]));
    for (const match of matches) {
      const routine = byId.get(match.subscriptionId);
      if (
        !routine ||
        routine.ownerUserId !== match.subscription.ownerUserId ||
        match.subscriptionRevision !== match.subscription.revision
      )
        continue;
      const envelope = await this.reader.readEvent({
        companyId: event.companyId,
        userId: routine.ownerUserId,
        eventId: event.id,
        subscriptionId: routine.id,
      });
      if (envelope) await this.start(event, envelope, [routine]);
    }
  }

  private async start(event: EventLog, triggerPayload: unknown, routines: EventRoutineCandidate[]): Promise<void> {
    const runs = await this.routines.admitEventRoutineRunsUnscoped({
      companyId: event.companyId,
      event: event.kind,
      entityId: event.subjectId,
      triggerPayload,
      routines: routines.map((routine) => ({
        id: routine.id,
        ownerUserId: routine.ownerUserId,
        updatedAt: routine.updatedAt,
      })),
      now: new Date(),
    });
    for (const run of runs) {
      await this.background.dispatch("run-routine", {
        routineRunId: run.id,
        companyId: event.companyId,
        ownerUserId: run.executedByUserId,
      });
    }
  }
}
