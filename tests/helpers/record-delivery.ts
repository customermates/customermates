import { PermissionService } from "@/core/base/permission.service";
import { PrismaUserRepo } from "@/features/user/prisma-user.repository";
import { PrismaWebhookRepo } from "@/features/webhook/prisma-webhook.repository";
import { PrismaWebhookDeliveryRepo } from "@/features/webhook/prisma-webhook-delivery.repository";
import { createTestRecordEventSubscriptionRepo, createTestRecordRepo } from "./record-repository";
import { RecordRecipientReader } from "@/features/records/record-recipient-reader";
import { PrismaRecordRecipientRepo } from "@/features/records/prisma-record-recipient.repository";
import { PrismaRoutineRepo } from "@/ee/routines/prisma-routine.repository";
import { PrismaAgentChatRepo } from "@/ee/agent-chat/prisma-agent-chat.repository";
import { PrismaWikiPageRepo } from "@/features/wiki/prisma-wiki-page.repository";
import { type RoutineEventAccess } from "@/ee/routines/routine-event-access";
import { PrismaRoutineEventAccess } from "@/ee/routines/prisma-routine-event-access.repository";

export const createTestRecordRecipientReader = () =>
  new RecordRecipientReader(
    (companyId) => createTestRecordRepo(companyId),
    new PrismaRecordRecipientRepo(new PrismaUserRepo(new PermissionService())),
  );
export const createTestRoutineRepo = (access?: RoutineEventAccess): PrismaRoutineRepo => {
  const routines: PrismaRoutineRepo = new PrismaRoutineRepo(
    access ?? new PrismaRoutineEventAccess(createTestRecordRecipientReader()),
    createTestRecordEventSubscriptionRepo(),
    new PermissionService(),
    () => new PrismaAgentChatRepo(new PrismaWikiPageRepo(new PermissionService()), new PermissionService(), routines),
  );
  return routines;
};

export const createTestWebhookRepo = () =>
  new PrismaWebhookRepo(
    createTestRecordEventSubscriptionRepo(),
    new PermissionService(),
    new PrismaWebhookDeliveryRepo(createTestRecordRecipientReader()),
  );
