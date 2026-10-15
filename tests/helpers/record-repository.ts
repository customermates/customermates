import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { RecordRepo, RecordRepoOwners } from "@/features/records/record.repo";
import { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordConfigurationService } from "@/features/records/configuration.service";
import type { WebhookPauseNotifier } from "@/features/webhook/webhook-pause-notifier";
import type { RecordWidgetConfigurationRepo } from "@/features/widget/record-widget-configuration.repo";
import type { ViewWidgetPurgeRepo } from "@/features/widget/view-widget-purge.repo";
import { PermissionService } from "@/core/base/permission.service";
import { PrismaRecordRepo } from "@/features/records/prisma-record.repository";
import { PrismaRecordEventSubscriptionRepo } from "@/features/records/prisma-record-event-subscription.repository";
import { PrismaRecordRecipientRepo } from "@/features/records/prisma-record-recipient.repository";
import { RecordRecipientReader } from "@/features/records/record-recipient-reader";
import { PrismaDataViewRepo } from "@/features/data-view/prisma-data-view.repository";
import { PrismaP13nRepo } from "@/features/p13n/prisma-p13n.repository";
import { PrismaTrashRepo } from "@/features/trash/prisma-trash.repository";
import { PrismaEventLogRepo } from "@/features/event/prisma-event-log.repository";
import { PrismaWebhookRepo } from "@/features/webhook/prisma-webhook.repository";
import { PrismaWebhookDeliveryRepo } from "@/features/webhook/prisma-webhook-delivery.repository";
import { PrismaRoutineRepo } from "@/ee/routines/prisma-routine.repository";
import { PrismaAgentChatRepo } from "@/ee/agent-chat/prisma-agent-chat.repository";
import { PrismaWikiPageRepo } from "@/features/wiki/prisma-wiki-page.repository";
import { PrismaRoutineEventAccess } from "@/ee/routines/prisma-routine-event-access.repository";
import { PrismaUserRepo } from "@/features/user/prisma-user.repository";
import { PrismaRoleRepo } from "@/features/role/prisma-role.repository";
import { PrismaRecordFileRepo } from "@/features/records/prisma-record-file.repository";
import { RecordCalculationService } from "@/features/records/record-calculation.service";
import { RecordConfigurationWriter } from "@/features/records/record-configuration-writer";
import { RecordOperationService } from "@/features/records/record-operation.service";
import { RecordTrashService } from "@/features/records/record-trash.service";
import { RecordWriteService } from "@/features/records/record-write.service";

const idleBackground: Pick<BackgroundTaskService, "dispatch"> = { dispatch: () => Promise.resolve() };

let widgetModule: Promise<typeof import("@/features/widget/prisma-widget.repository")> | undefined;
const loadWidgetModule = () => (widgetModule ??= import("@/features/widget/prisma-widget.repository"));
const widgetRepo = async () => new (await loadWidgetModule()).PrismaWidgetRepo();

export async function preloadTestRecordRepo(): Promise<void> {
  await loadWidgetModule();
}

const widgets: RecordWidgetConfigurationRepo & ViewWidgetPurgeRepo = {
  getActivityQueriesCompanyWide: async (companyId, afterId) =>
    (await widgetRepo()).getActivityQueriesCompanyWide(companyId, afterId),
  getMeasuresCompanyWide: async (companyId, afterId) => (await widgetRepo()).getMeasuresCompanyWide(companyId, afterId),
  rewriteMeasureCompanyWide: async (companyId, id, measure) =>
    (await widgetRepo()).rewriteMeasureCompanyWide(companyId, id, measure),
  purgeOnTrashedViewsCompanyWide: async (companyId, viewIds) =>
    (await widgetRepo()).purgeOnTrashedViewsCompanyWide(companyId, viewIds),
};

export const createTestRecordRepo = (companyId?: string, background?: Pick<BackgroundTaskService, "dispatch">) =>
  new PrismaRecordRepo(createTestRecordRepoOwners, companyId, background);

export const createTestDataViewRepo = (companyId?: string) =>
  new PrismaDataViewRepo({ widgets, personalizations: new PrismaP13nRepo() }, companyId);

export const createTestRecordEventSubscriptionRepo = (companyId?: string) => {
  const records = createTestRecordRepo(companyId);
  const users = new PrismaUserRepo(new PermissionService());
  return new PrismaRecordEventSubscriptionRepo(records, new RecordAccessPolicy(users, records), users, companyId);
};

export function createTestRecordRepoOwners(): RecordRepoOwners {
  const subscriptions = createTestRecordEventSubscriptionRepo();
  const reader = new RecordRecipientReader(
    (companyId) => createTestRecordRepo(companyId),
    new PrismaRecordRecipientRepo(new PrismaUserRepo(new PermissionService())),
  );
  const routines: PrismaRoutineRepo = new PrismaRoutineRepo(
    new PrismaRoutineEventAccess(reader),
    subscriptions,
    new PermissionService(),
    () => new PrismaAgentChatRepo(new PrismaWikiPageRepo(new PermissionService()), new PermissionService(), routines),
  );
  return {
    widgets,
    views: createTestDataViewRepo(),
    personalizations: new PrismaP13nRepo(),
    trash: new PrismaTrashRepo(),
    events: new PrismaEventLogRepo(idleBackground),
    webhooks: new PrismaWebhookRepo(subscriptions, new PermissionService(), new PrismaWebhookDeliveryRepo(reader)),
    routines,
    members: new PrismaUserRepo(new PermissionService()),
    roles: new PrismaRoleRepo(),
    subscriptions,
    files: new PrismaRecordFileRepo(),
  };
}

export const createTestRecordOperationService = (
  records: RecordRepo,
  policy: RecordAccessPolicy,
  configurations: RecordConfigurationService,
  webhooks: WebhookPauseNotifier,
  systemCompanyId?: string,
) =>
  new RecordOperationService(
    records,
    policy,
    configurations,
    webhooks,
    new RecordCalculationService(records),
    new RecordWriteService(records, policy, new RecordCalculationService(records)),
    new RecordConfigurationWriter(records, new RecordCalculationService(records), webhooks),
    new RecordTrashService(records, new RecordCalculationService(records)),
    systemCompanyId,
  );
