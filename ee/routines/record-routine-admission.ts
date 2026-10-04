import type { RecordEvent } from "@/generated/prisma";
import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { RecordEventAdmission } from "@/features/records/record-event-admission";
import { RecordEventPayloadSchema } from "@/features/records/record-event.schema";
import type { RecordRecipientReader } from "@/features/records/record-recipient-reader";
import type { TriggerRoutinesRepo } from "./trigger-routines.repo";

export class RecordRoutineAdmission extends BaseRepository implements RecordEventAdmission {
  constructor(
    private readonly routines: TriggerRoutinesRepo,
    private readonly background: BackgroundTaskService,
    private readonly reader: RecordRecipientReader,
  ) {
    super();
  }

  @BypassTenantGuard
  async admit(event: RecordEvent): Promise<void> {
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
    if (!matches.length) return;
    const subscribed = await this.routines.findEventRoutinesUnscoped(event.companyId, event.kind);
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
      if (!envelope) continue;
      const runs = await this.routines.admitEventRoutineRunsUnscoped({
        companyId: event.companyId,
        event: event.kind,
        entityId: event.recordId,
        triggerPayload: envelope,
        routines: [{ id: routine.id, ownerUserId: routine.ownerUserId, updatedAt: routine.updatedAt }],
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
}
