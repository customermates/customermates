import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { RecordRepoOwners } from "@/features/records/record.repo";
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
import { PrismaRoutineEventAccess } from "@/ee/routines/prisma-routine-event-access.repository";
import { PrismaUserRepo } from "@/features/user/prisma-user.repository";
import { PrismaRoleRepo } from "@/features/role/prisma-role.repository";

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

export function createTestRecordRepoOwners(): RecordRepoOwners {
  const subscriptions = new PrismaRecordEventSubscriptionRepo(createTestRecordRepo());
  const reader = new RecordRecipientReader((companyId) => createTestRecordRepo(companyId), new PrismaRecordRecipientRepo());
  return {
    widgets,
    views: createTestDataViewRepo(),
    personalizations: new PrismaP13nRepo(),
    trash: new PrismaTrashRepo(),
    events: new PrismaEventLogRepo(idleBackground),
    webhooks: new PrismaWebhookRepo(subscriptions, new PermissionService(), new PrismaWebhookDeliveryRepo(reader)),
    routines: new PrismaRoutineRepo(new PrismaRoutineEventAccess(reader), subscriptions, new PermissionService()),
    members: new PrismaUserRepo(new PermissionService()),
    roles: new PrismaRoleRepo(),
    subscriptions,
  };
}
