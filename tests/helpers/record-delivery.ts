import { PermissionService } from "@/core/base/permission.service";
import { PrismaWebhookRepo } from "@/features/webhook/prisma-webhook.repository";
import { PrismaRecordRepo } from "@/features/records/prisma-record.repository";
import { PrismaRecordEventSubscriptionRepo } from "@/features/records/prisma-record-event-subscription.repository";
import { RecordRecipientReader } from "@/features/records/record-recipient-reader";
import { PrismaRoutineRepo } from "@/ee/routines/prisma-routine.repository";
import { type RoutineEventAccess } from "@/ee/routines/routine-event-access";
import { PrismaRoutineEventAccess } from "@/ee/routines/prisma-routine-event-access";

export const createTestRecordRecipientReader = () =>
  new RecordRecipientReader((companyId) => new PrismaRecordRepo(companyId));
export const createTestRoutineRepo = (access?: RoutineEventAccess) =>
  new PrismaRoutineRepo(
    access ?? new PrismaRoutineEventAccess(createTestRecordRecipientReader()),
    new PrismaRecordEventSubscriptionRepo(new PrismaRecordRepo()),
    new PermissionService(),
  );

export const createTestWebhookRepo = () =>
  new PrismaWebhookRepo(new PrismaRecordEventSubscriptionRepo(new PrismaRecordRepo()), new PermissionService());
